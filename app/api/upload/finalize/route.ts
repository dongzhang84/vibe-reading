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

/**
 * Phase 2 of the upload flow. The client has already PUT the PDF to
 * Supabase Storage at `storagePath`. This route pulls it back, parses,
 * runs intake AI, and writes the books + chapters rows.
 *
 * Body never crosses a Vercel function — the download from Storage is
 * function-internal egress, not subject to the inbound HTTP body limit.
 */
export async function POST(request: Request) {
  const sessionId = await getOrCreateSessionId()

  const body = (await request.json().catch(() => null)) as {
    storagePath?: unknown
    filename?: unknown
  } | null
  if (
    !body ||
    typeof body.storagePath !== 'string' ||
    typeof body.filename !== 'string'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Storage path must belong to the current session — prevents picking up
  // someone else's blob even if the path leaks.
  const expectedPrefix = `session/${sessionId}/`
  if (
    !body.storagePath.startsWith(expectedPrefix) ||
    !body.storagePath.endsWith('.pdf') ||
    body.storagePath.includes('..')
  ) {
    return NextResponse.json(
      { error: 'Invalid storage path' },
      { status: 403 },
    )
  }

  const db = createAdminClient()

  const { data: blob, error: dlErr } = await db.storage
    .from(STORAGE_BUCKET)
    .download(body.storagePath)
  if (dlErr || !blob) {
    console.error('storage download failed', dlErr)
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }
  if (blob.size > MAX_BYTES) {
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
    return NextResponse.json({ error: 'Max 50MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await blob.arrayBuffer())

  let outline: OutlineResult | null = null
  try {
    outline = await extractOutlineAndChapters(buffer)
  } catch (err) {
    console.error('outline extraction failed (non-fatal)', err)
  }

  let parsed
  try {
    parsed = await parsePdf(buffer, body.filename)
  } catch (err) {
    console.error('pdf parse failed', err)
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
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
      await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
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

  // Cast to bypass stale generated types — `size_bytes` is added in
  // scripts/migrate-v2.3-storage-quota.sql and lands in types/db.ts on
  // the next `npm run db:types`.
  const insertRow = {
    session_id: sessionId,
    title: parsed.title,
    author: parsed.author,
    storage_path: body.storagePath,
    page_count: parsed.pageCount,
    size_bytes: blob.size,
    toc: (toc ?? null) as Json | null,
    overview: intake?.overview ?? null,
    suggested_questions: (intake?.questions ?? null) as Json | null,
  }
  const { data: book, error: bookError } = await db
    .from('books')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertRow as any)
    .select()
    .single()
  if (bookError || !book) {
    console.error('book insert failed', bookError)
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
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
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
    return NextResponse.json(
      { error: 'Failed to save chapters' },
      { status: 500 },
    )
  }

  return NextResponse.json({ bookId: book.id })
}
