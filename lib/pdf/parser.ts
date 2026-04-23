import 'server-only'
import { extractText, getDocumentProxy, getMeta } from 'unpdf'

export interface ParsedPdf {
  title: string
  author: string | null
  text: string
  pageCount: number
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  const data = new Uint8Array(buffer)
  const pdf = await getDocumentProxy(data)
  try {
    const [{ info }, { totalPages, text }] = await Promise.all([
      getMeta(pdf),
      extractText(pdf, { mergePages: true }),
    ])
    return {
      title: cleanStr(info?.Title) ?? cleanStr(info?.title) ?? 'Untitled',
      author: cleanStr(info?.Author) ?? cleanStr(info?.author) ?? null,
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

export interface ChapterChunk {
  title: string
  content: string
}

/**
 * Rule-based chapter splitter. Tries "Chapter N", "CHAPTER N", "第 N 章".
 * If nothing matches, falls back to splitting on large whitespace gaps.
 *
 * Known limitation: doesn't handle "Part I / Book I" headings, roman
 * numerals, or PDFs where chapter markers span multiple lines. Good enough
 * for MVP — iterate when we find a book it fails on.
 */
export function splitIntoChapters(fullText: string): ChapterChunk[] {
  const pattern =
    /\n\s*(?:Chapter\s+\d+|CHAPTER\s+\d+|第[一二三四五六七八九十百零〇零\d]+章)[^\n]{0,80}\n/gi

  const matches: { index: number; titleLine: string }[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(fullText)) !== null) {
    matches.push({ index: m.index, titleLine: m[0].trim() })
  }

  if (matches.length === 0) {
    return fallbackSplit(fullText)
  }

  const chunks: ChapterChunk[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length
    const raw = fullText.slice(start, end).trim()
    const firstNewline = raw.indexOf('\n')
    const titleLine = firstNewline === -1 ? raw : raw.slice(0, firstNewline)
    const body = firstNewline === -1 ? '' : raw.slice(firstNewline + 1).trim()
    chunks.push({
      title: titleLine.trim(),
      content: body,
    })
  }
  return chunks.filter((c) => c.content.length > 200)
}

function fallbackSplit(text: string): ChapterChunk[] {
  return text
    .split(/\n{5,}/)
    .map((s, i) => ({
      title: `Section ${i + 1}`,
      content: s.trim(),
    }))
    .filter((c) => c.content.length > 500)
}
