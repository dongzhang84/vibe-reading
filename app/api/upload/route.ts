import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePdf, splitIntoChapters } from '@/lib/pdf/parser'
import {
  extractOutlineAndChapters,
  type OutlineResult,
  type TocEntry,
} from '@/lib/pdf/outline'
import { analyzeBook, type IntakeResult } from '@/lib/ai/intake'
import type { Json } from '@/types/db'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'vr-docs'

interface NormalizedChapter {
  seq: number
  title: string
  content: string
  level: number
  pageStart: number | null
  pageEnd: number | null
}

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

  // Try PDF outline first; fall back to regex chapter splitter when missing.
  let outline: OutlineResult | null = null
  try {
    outline = await extractOutlineAndChapters(buffer)
  } catch (err) {
    console.error('outline extraction failed (non-fatal)', err)
  }

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

  let toc: TocEntry[] | null = null
  let chapters: NormalizedChapter[]
  if (outline && outline.chapters.length >= 2) {
    toc = outline.toc
    chapters = outline.chapters.map((c, i) => ({
      seq: i,
      title: c.title,
      content: c.content,
      level: c.level,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
    }))
  } else {
    const fallback = splitIntoChapters(parsed.text)
    if (fallback.length === 0) {
      return NextResponse.json(
        { error: 'Could not detect any chapters or sections in this PDF' },
        { status: 422 },
      )
    }
    chapters = fallback.map((c, i) => ({
      seq: i,
      title: c.title,
      content: c.content,
      level: 1,
      pageStart: null,
      pageEnd: null,
    }))
  }

  const db = createAdminClient()

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

  // Intake AI: overview + 3 starter questions. Non-fatal on failure — Book Home
  // can render a TOC-only page when these are null.
  let intake: IntakeResult | null = null
  try {
    const intro =
      chapters[0]?.content?.slice(0, 2000) ?? parsed.text.slice(0, 2000)
    const conclusion =
      chapters[chapters.length - 1]?.content?.slice(-2000) ??
      parsed.text.slice(-2000)
    intake = await analyzeBook({
      title: parsed.title,
      author: parsed.author,
      tocTitles: chapters.map((c) => c.title),
      intro,
      conclusion,
    })
  } catch (err) {
    console.error('intake AI failed (non-fatal)', err)
  }

  const { data: book, error: bookError } = await db
    .from('books')
    .insert({
      session_id: sessionId,
      title: parsed.title,
      author: parsed.author,
      storage_path: storagePath,
      page_count: parsed.pageCount,
      toc: (toc ?? null) as Json | null,
      overview: intake?.overview ?? null,
      suggested_questions: (intake?.questions ?? null) as Json | null,
    })
    .select()
    .single()
  if (bookError || !book) {
    console.error('book insert failed', bookError)
    await db.storage.from(STORAGE_BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: 'Failed to save book' },
      { status: 500 },
    )
  }

  const { error: chaptersError } = await db.from('chapters').insert(
    chapters.map((c) => ({
      book_id: book.id,
      seq: c.seq,
      title: c.title,
      content: c.content,
      level: c.level,
      page_start: c.pageStart,
      page_end: c.pageEnd,
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
