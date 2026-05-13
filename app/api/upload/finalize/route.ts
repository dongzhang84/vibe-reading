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
import { parseEpub, EpubParseError } from '@/lib/epub/parser'
import { analyzeBook, type IntakeResult } from '@/lib/ai/intake'
import type { Json } from '@/types/db'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'vr-docs'
const MAX_CONTENT_BYTES = 1_000_000
const MAX_CONTENT_HTML_BYTES = 2_000_000 // HTML has markup overhead vs plain text

interface NormalizedChapter {
  seq: number
  title: string
  content: string
  contentHtml: string | null // populated for EPUB; null for PDF
  level: number
  pageStart: number | null
  pageEnd: number | null
}

interface ParsedBook {
  title: string
  author: string | null
  pageCount: number
  toc: TocEntry[] | null
  chapters: NormalizedChapter[]
  /** PDF only — used as intake-AI fallback when chapter[0] is empty */
  rawText?: string
}

interface ProcessError {
  status: number
  message: string
}

function isError(x: ParsedBook | ProcessError): x is ProcessError {
  return 'status' in x
}

/**
 * Phase 2 of the upload flow. The client has already PUT the file to
 * Supabase Storage at `storagePath`. This route pulls it back, parses
 * (PDF or EPUB), runs intake AI, and writes the books + chapters rows.
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

  const result =
    format === 'epub'
      ? await processEpub(buffer)
      : await processPdf(buffer, body.filename)

  if (isError(result)) {
    await db.storage.from(STORAGE_BUCKET).remove([body.storagePath])
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    )
  }

  // Intake AI: overview + 3 starter questions. Non-fatal — Book Home
  // renders a TOC-only page when these are null.
  let intake: IntakeResult | null = null
  try {
    const intro =
      result.chapters[0]?.content?.slice(0, 2000) ||
      result.rawText?.slice(0, 2000) ||
      ''
    const conclusion =
      result.chapters[result.chapters.length - 1]?.content?.slice(-2000) ||
      result.rawText?.slice(-2000) ||
      ''
    intake = await analyzeBook({
      title: result.title,
      author: result.author,
      tocTitles: result.chapters.map((c) => c.title),
      intro,
      conclusion,
    })
  } catch (err) {
    console.error('intake AI failed (non-fatal)', err)
  }

  // Cast to bypass stale generated types — `size_bytes` (v2.3) and
  // `format` (v2.4) land in types/db.ts on the next `npm run db:types`.
  const insertRow = {
    session_id: sessionId,
    title: result.title,
    author: result.author,
    storage_path: body.storagePath,
    page_count: result.pageCount,
    size_bytes: blob.size,
    format,
    toc: (result.toc ?? null) as Json | null,
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

  // Belt-and-suspenders: PDF parser/outline already strip NUL bytes at the
  // source. EPUB sanitize also strips. This re-strips so any future code
  // path can't sneak NULs into the chapters insert. Also caps content to
  // 1MB plain / 2MB HTML per row.
  const safeChapters = result.chapters.map((c) => ({
    book_id: book.id,
    seq: c.seq,
    title: stripNul(c.title) || `Chapter ${c.seq + 1}`,
    content: stripNul(c.content).slice(0, MAX_CONTENT_BYTES),
    content_html: c.contentHtml
      ? stripNul(c.contentHtml).slice(0, MAX_CONTENT_HTML_BYTES)
      : null,
    level: c.level,
    page_start: c.pageStart,
    page_end: c.pageEnd,
  }))
  const { error: chaptersError } = await db
    .from('chapters')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(safeChapters as any)
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

// ─── PDF pipeline ──────────────────────────────────────────────────────

async function processPdf(
  buffer: Buffer,
  filename: string,
): Promise<ParsedBook | ProcessError> {
  let outline: OutlineResult | null = null
  try {
    outline = await extractOutlineAndChapters(buffer)
  } catch (err) {
    console.error('outline extraction failed (non-fatal)', err)
  }

  let parsed
  try {
    parsed = await parsePdf(buffer, filename)
  } catch (err) {
    console.error('pdf parse failed', err)
    return { status: 422, message: 'Could not parse PDF' }
  }

  let toc: TocEntry[] | null = null
  let chapters: NormalizedChapter[]
  if (outline && outline.chapters.length >= 2) {
    toc = outline.toc
    chapters = outline.chapters.map((c, i) => ({
      seq: i,
      title: c.title,
      content: c.content,
      contentHtml: null,
      level: c.level,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
    }))
  } else {
    const fallback = splitIntoChapters(parsed.text)
    if (fallback.length === 0) {
      return {
        status: 422,
        message: 'Could not detect any chapters or sections in this PDF',
      }
    }
    chapters = fallback.map((c, i) => ({
      seq: i,
      title: c.title,
      content: c.content,
      contentHtml: null,
      level: 1,
      pageStart: null,
      pageEnd: null,
    }))
  }

  // Drop shadow-library watermark "chapters" (Anna's Archive / DuXiu /
  // Z-Library cover pages whose content is archive metadata, not book
  // text). If filtering empties the list, the PDF is almost certainly a
  // scanned image with no extractable text layer.
  const beforeFilter = chapters.length
  chapters = chapters.filter(
    (c) => !looksLikeShadowLibraryWatermark(c.content),
  )
  const filteredOut = beforeFilter - chapters.length

  if (chapters.length === 0) {
    const msg =
      filteredOut > 0
        ? 'This PDF looks like a shadow-library download (Anna’s Archive / DuXiu) where the only readable text is the archive metadata page — the rest of the book is likely a scanned image with no text layer. Try uploading a PDF with extractable text.'
        : 'No readable chapter text found in this PDF. Common cause: the PDF is a scanned image with no text layer. Try uploading a different copy.'
    return { status: 422, message: msg }
  }
  // Re-seq after filtering so chapter ordering stays 0..N-1 in the DB.
  chapters = chapters.map((c, i) => ({ ...c, seq: i }))

  return {
    title: parsed.title,
    author: parsed.author,
    pageCount: parsed.pageCount,
    toc,
    chapters,
    rawText: parsed.text,
  }
}

// ─── EPUB pipeline ─────────────────────────────────────────────────────

async function processEpub(
  buffer: Buffer,
): Promise<ParsedBook | ProcessError> {
  try {
    const epub = await parseEpub(buffer)
    return {
      title: epub.title,
      author: epub.author,
      pageCount: epub.spineLength,
      toc: epub.toc,
      chapters: epub.chapters.map((c) => ({
        seq: c.seq,
        title: c.title,
        content: c.content,
        contentHtml: c.contentHtml,
        level: c.level,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
      })),
    }
  } catch (err) {
    if (err instanceof EpubParseError) {
      return { status: 422, message: epubErrorMessage(err) }
    }
    console.error('epub parse failed (unexpected)', err)
    return {
      status: 422,
      message: 'Could not parse EPUB (malformed or unsupported file).',
    }
  }
}

function epubErrorMessage(err: EpubParseError): string {
  switch (err.code) {
    case 'drm_protected':
      return "This EPUB is DRM-protected and can't be processed. Try a non-DRM copy."
    case 'image_only':
      return 'This EPUB appears to be image-only — try a copy with extractable text.'
    case 'empty_spine':
      return 'No readable chapters found in this EPUB.'
    case 'invalid_container':
    case 'no_opf':
    case 'invalid_opf':
      return 'This EPUB is malformed (missing container.xml or OPF). Try a different copy.'
    case 'parse_failed':
    default:
      return 'Could not parse EPUB (corrupted or unsupported file).'
  }
}
