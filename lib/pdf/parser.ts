import 'server-only'
import { extractText, getDocumentProxy, getMeta } from 'unpdf'

export interface ParsedPdf {
  title: string
  author: string | null
  text: string
  pageCount: number
}

export async function parsePdf(
  buffer: Buffer,
  filename?: string,
): Promise<ParsedPdf> {
  const data = new Uint8Array(buffer)
  const pdf = await getDocumentProxy(data)
  try {
    const [{ info }, { totalPages, text }] = await Promise.all([
      getMeta(pdf),
      extractText(pdf, { mergePages: true }),
    ])
    const fromMetaTitle =
      cleanStr(info?.Title) ?? cleanStr(info?.title) ?? null
    const fromMetaAuthor =
      cleanStr(info?.Author) ?? cleanStr(info?.author) ?? null
    const fromFilename = filename ? deriveFromFilename(filename) : null
    return {
      title: fromMetaTitle ?? fromFilename?.title ?? 'Untitled',
      author: fromMetaAuthor ?? fromFilename?.author ?? null,
      text: text as string,
      pageCount: totalPages,
    }
  } finally {
    await pdf.destroy()
  }
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Many PDFs ship with no Title metadata, so "Untitled" is a common UX hit.
 * Filename is usually the next-best signal — most users name files like
 * `Beyond Vibe Coding (Addy Osmani).pdf` or `kuhn_structure-of-revolutions.pdf`.
 * Strip the extension, normalize separators, and try to peel off a trailing
 * `(Author Name)` group if it looks like a person's name.
 */
function deriveFromFilename(
  filename: string,
): { title: string; author: string | null } | null {
  const base = filename
    .replace(/\.pdf$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (base.length === 0) return null

  const parens = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (parens) {
    const inner = parens[2].trim()
    const looksLikeName =
      inner.length >= 3 &&
      inner.length <= 60 &&
      inner.includes(' ') &&
      /^[\p{L}][\p{L}\s.'-]+$/u.test(inner)
    return {
      title: parens[1].trim(),
      author: looksLikeName ? inner : null,
    }
  }
  return { title: base, author: null }
}

export interface ChapterChunk {
  title: string
  content: string
}

/**
 * Chapter splitter. Tries several heading patterns in order of preference
 * (coarser → finer granularity). Falls back to size-based splitting if
 * nothing matches well.
 *
 * Key design choice: do NOT require `\n` around the heading. PDF text
 * extraction often returns a single long flow without the line breaks
 * the source had; "第1章 务实的哲学 1 人生是你的" all runs together.
 * So we match the heading token itself and use its index as a boundary.
 *
 * A pattern is only accepted if it yields ≥3 chunks — otherwise try the
 * next pattern. Last resort: split by ~10k char sections.
 */
const HEADING_PATTERNS: readonly RegExp[] = [
  /Chapter\s+\d+/g,
  /CHAPTER\s+\d+/g,
  /第[\d一二三四五六七八九十百零〇]+章/g,
  /Part\s+[IVX]+\b/g,
  /第[\d一二三四五六七八九十百零〇]+(?:篇|部)/g,
  /(?:话题|专题|Topic|Tip)\s*\d+/gi,
]

export function splitIntoChapters(fullText: string): ChapterChunk[] {
  const text = fullText
  const MIN_CHUNKS = 3

  for (const pat of HEADING_PATTERNS) {
    const chunks = dedupAndFilter(splitByHeading(text, pat))
    if (chunks.length >= MIN_CHUNKS) return chunks
  }
  return sizeBasedSplit(text)
}

/**
 * PDFs often duplicate chapter headings (once in TOC, once at chapter start).
 * Cross-references inside chapter text also match our heading regex. Result
 * is noise: multiple short chunks for the same chapter number.
 *
 * Strategy: (1) drop chunks too short to be a real chapter (TOC entries are
 * typically 200-400 chars), (2) for the rest, group by normalized heading
 * number and keep the longest — that's the real chapter body.
 */
function dedupAndFilter(chunks: ChapterChunk[]): ChapterChunk[] {
  const MIN_CONTENT_CHARS = 1000
  const byKey = new Map<string, ChapterChunk>()
  const keyless: ChapterChunk[] = []
  for (const c of chunks) {
    if (c.content.length < MIN_CONTENT_CHARS) continue
    const key = dedupKey(c.title)
    if (!key) {
      keyless.push(c)
      continue
    }
    const prev = byKey.get(key)
    if (!prev || c.content.length > prev.content.length) {
      byKey.set(key, c)
    }
  }
  // Restore chapter order by the number extracted from the title. For titles
  // without a number (fall through to keyless), keep them last in the order
  // they appeared.
  const titled = [...byKey.values()].sort((a, b) => {
    const na = extractChapterNum(a.title)
    const nb = extractChapterNum(b.title)
    if (na !== null && nb !== null) return na - nb
    if (na !== null) return -1
    if (nb !== null) return 1
    return 0
  })
  return [...titled, ...keyless]
}

function extractChapterNum(title: string): number | null {
  const match = normalizeCJKNum(title).match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}

function dedupKey(title: string): string {
  const match = title.match(
    /^(?:Chapter\s+\d+|CHAPTER\s+\d+|Part\s+[IVX]+|第[\d一二三四五六七八九十百零〇]+(?:章|篇|部)|(?:话题|专题|Topic|Tip)\s*\d+)/i,
  )
  if (!match) return ''
  return normalizeCJKNum(match[0])
    .replace(/\s+/g, '')
    .toLowerCase()
}

const CJK_NUM_MAP: Record<string, string> = {
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
}

function normalizeCJKNum(s: string): string {
  return s.replace(/[一二三四五六七八九十]/g, (c) => CJK_NUM_MAP[c] ?? c)
}

function splitByHeading(text: string, pattern: RegExp): ChapterChunk[] {
  const re = new RegExp(pattern.source, pattern.flags)
  const indices: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    indices.push(m.index)
    // Avoid zero-width infinite loops on empty matches
    if (m.index === re.lastIndex) re.lastIndex++
  }
  if (indices.length < 2) return []

  const chunks: ChapterChunk[] = []
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1] : text.length
    const raw = text.slice(start, end).trim()
    chunks.push({
      title: extractTitle(raw),
      content: raw,
    })
  }
  return chunks
}

/**
 * Take the heading + just enough of the following line to be recognizable.
 * PDF flow often packs things: "第1章 务实的哲学 1 人生是你的 提示3 …"
 * — we cut at the first sign of a sub-section (digit + space, sub-heading,
 * or ~30 chars).
 */
function extractTitle(raw: string): string {
  const lineBreak = raw.indexOf('\n')
  let head = lineBreak > 0 && lineBreak < 120 ? raw.slice(0, lineBreak) : raw
  head = head.slice(0, 60)
  // If there's a clear "chapter title + first sub-section" pattern, cut at
  // the sub-section marker.
  const subSection = head.match(/^(.+?)(?:\s+\d+\s+[一-龥A-Z]|\s+提示\s*\d+|\s+话题\s*\d+)/)
  if (subSection && subSection[1].length >= 4) {
    return subSection[1].trim()
  }
  return head.trim()
}

function sizeBasedSplit(text: string): ChapterChunk[] {
  const TARGET = 10000
  const SNAP_WINDOW = 1500
  const MAX_CHUNKS = 50
  const MIN_CHARS = 400
  const chunks: ChapterChunk[] = []
  let pos = 0
  let idx = 0
  while (pos < text.length && idx < MAX_CHUNKS) {
    let end = Math.min(pos + TARGET, text.length)
    if (end < text.length) {
      const window = text.slice(end, Math.min(end + SNAP_WINDOW, text.length))
      const match = window.search(/\n\n|\s{4,}| /)
      if (match >= 0) end = end + match
    }
    const content = text.slice(pos, end).trim()
    if (content.length >= MIN_CHARS) {
      chunks.push({
        title: `Section ${idx + 1}`,
        content,
      })
    }
    pos = end
    idx++
  }
  return chunks
}
