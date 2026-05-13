import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePdf, splitIntoChapters, stripNul } from '@/lib/pdf/parser'
import {
  extractOutlineAndChapters,
  looksLikeShadowLibraryWatermark,
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
  const isPdfPath = body.storagePath.endsWith('.pdf')
  const isEpubPath = body.storagePath.endsWith('.epub')
  if (
    !body.storagePath.startsWith(expectedPrefix) ||
    (!isPdfPath && !isEpubPath) ||
    body.storagePath.includes('..')
  ) {
    return NextResponse.json(
      { error: 'Invalid storage path' },
      { status: 403 },
    )
  }
  const format: 'pdf' | 'epub' = isEpubPath ? 'epub' : 'pdf'

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

  // EPUB pipeline is wired in E3/E4. Until then, refuse the upload
  // gracefully (rather than feeding the ZIP to the PDF parser).
  if (format === 'epub') {
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
    return NextResponse.json(
      { error: 'EPUB support coming soon — please upload a PDF for now.' },
      { status: 501 },
    )
  }

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

  // Drop shadow-library watermark "chapters" (Anna's Archive / DuXiu /
  // Z-Library cover pages whose content is archive metadata, not book
  // text). If filtering empties the chapter list, the PDF is almost
  // certainly a scanned image with no extractable text layer — bail out
  // with a friendly message so the user knows to find a different copy.
  const beforeFilter = chapters.length
  chapters = chapters.filter(
    (c) => !looksLikeShadowLibraryWatermark(c.content),
  )
  const filteredOut = beforeFilter - chapters.length

  if (chapters.length === 0) {
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
    const msg =
      filteredOut > 0
        ? 'This PDF looks like a shadow-library download (Anna’s Archive / DuXiu) where the only readable text is the archive metadata page — the rest of the book is likely a scanned image with no text layer. Try uploading a PDF with extractable text.'
        : 'No readable chapter text found in this PDF. Common cause: the PDF is a scanned image with no text layer. Try uploading a different copy.'
    return NextResponse.json({ error: msg }, { status: 422 })
  }
  // Re-seq after filtering so chapter ordering stays 0..N-1 in the DB.
  chapters = chapters.map((c, i) => ({ ...c, seq: i }))

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
    format,
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

  // Belt-and-suspenders: parser.ts and outline.ts already strip NUL bytes
  // at the source, but if a future code path (regex fallback edge case,
  // EPUB parser, etc.) ever feeds raw bytes here, we don't want chapters
  // to silently fail and orphan the book row. Also caps content to 1MB
  // per row to bound the PostgREST request payload.
  const MAX_CONTENT_BYTES = 1_000_000
  const safeChapters = chapters.map((c) => ({
    book_id: book.id,
    seq: c.seq,
    title: stripNul(c.title) || `Chapter ${c.seq + 1}`,
    content: stripNul(c.content).slice(0, MAX_CONTENT_BYTES),
    level: c.level,
    page_start: c.pageStart,
    page_end: c.pageEnd,
  }))
  const { error: chaptersError } = await db.from('chapters').insert(safeChapters)
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
