import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePdf, splitIntoChapters } from '@/lib/pdf/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'vr-docs'

export async function POST(request: Request) {
  const sessionId = await getOrCreateSessionId()

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'PDF only' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Max 50MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let parsed
  try {
    parsed = await parsePdf(buffer)
  } catch (err) {
    console.error('pdf parse failed', err)
    return NextResponse.json(
      { error: 'Could not parse PDF' },
      { status: 422 },
    )
  }

  const chapters = splitIntoChapters(parsed.text)
  if (chapters.length === 0) {
    return NextResponse.json(
      { error: 'Could not detect any chapters or sections in this PDF' },
      { status: 422 },
    )
  }

  const db = createAdminClient()

  // Upload the PDF to Storage first. Path isolated by session so cron cleanup
  // can bulk-delete orphan uploads by session prefix.
  const storagePath = `session/${sessionId}/${crypto.randomUUID()}.pdf`
  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (uploadError) {
    console.error('storage upload failed', uploadError)
    return NextResponse.json(
      { error: 'Storage upload failed' },
      { status: 500 },
    )
  }

  const { data: book, error: bookError } = await db
    .from('books')
    .insert({
      session_id: sessionId,
      title: parsed.title,
      author: parsed.author,
      storage_path: storagePath,
      page_count: parsed.pageCount,
    })
    .select()
    .single()
  if (bookError || !book) {
    console.error('book insert failed', bookError)
    // Best-effort rollback of storage blob.
    await db.storage.from(STORAGE_BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: 'Failed to save book' },
      { status: 500 },
    )
  }

  const { error: chaptersError } = await db.from('chapters').insert(
    chapters.map((c, i) => ({
      book_id: book.id,
      seq: i,
      title: c.title,
      content: c.content,
    })),
  )
  if (chaptersError) {
    console.error('chapters insert failed', chaptersError)
    await db.from('books').delete().eq('id', book.id)
    await db.storage.from(STORAGE_BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: 'Failed to save chapters' },
      { status: 500 },
    )
  }

  return NextResponse.json({ bookId: book.id })
}
