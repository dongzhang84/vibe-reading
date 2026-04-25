import 'server-only'
import { extractText, getDocumentProxy } from 'unpdf'

export interface TocEntry {
  title: string
  level: number
  page: number
}

export interface OutlineChapter {
  title: string
  level: 1
  pageStart: number
  pageEnd: number
  content: string
}

export interface OutlineResult {
  toc: TocEntry[]
  chapters: OutlineChapter[]
  pageCount: number
}

const MIN_TOP_CHAPTERS = 2

/**
 * Pull the embedded outline (TOC) from a PDF and slice per-top-level-entry
 * content using each entry's resolved page number. Returns null when the PDF
 * has no outline or the outline produces too few top-level entries — caller
 * should then fall back to regex-based splitting.
 *
 * Top-level chapters get full content; sub-section entries (level ≥ 2) only
 * land in `toc` for Book Home rendering — they don't get their own chapter row.
 */
export async function extractOutlineAndChapters(
  buffer: Buffer,
): Promise<OutlineResult | null> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const outline = await pdf.getOutline()
    if (!outline || outline.length === 0) return null

    const flat: TocEntry[] = []
    async function walk(nodes: unknown[], level: number): Promise<void> {
      for (const raw of nodes) {
        const node = raw as { title?: unknown; dest?: unknown; items?: unknown }
        const title =
          typeof node.title === 'string' ? node.title.trim() : ''
        if (title.length > 0) {
          const page = await resolvePage(pdf, node.dest)
          if (page !== null) flat.push({ title, level, page })
        }
        if (Array.isArray(node.items) && node.items.length > 0) {
          await walk(node.items, level + 1)
        }
      }
    }
    await walk(outline as unknown[], 1)

    const tops = flat.filter((e) => e.level === 1)
    if (tops.length < MIN_TOP_CHAPTERS) return null

    const totalPages = (pdf as unknown as { numPages: number }).numPages

    const { text: pages } = await extractText(pdf, { mergePages: false })
    const pageArr = Array.isArray(pages) ? pages : [pages as string]

    const chapters: OutlineChapter[] = []
    for (let i = 0; i < tops.length; i++) {
      const cur = tops[i]
      const next = tops[i + 1]
      const pageStart = clampPage(cur.page, totalPages)
      const pageEnd = next
        ? clampPage(next.page - 1, totalPages)
        : totalPages
      const safeEnd = Math.max(pageEnd, pageStart)
      const content = pageArr
        .slice(pageStart - 1, safeEnd)
        .join('\n')
        .trim()
      chapters.push({
        title: cur.title,
        level: 1,
        pageStart,
        pageEnd: safeEnd,
        content,
      })
    }

    return { toc: flat, chapters, pageCount: totalPages }
  } finally {
    await pdf.destroy()
  }
}

async function resolvePage(
  pdf: unknown,
  dest: unknown,
): Promise<number | null> {
  if (!dest) return null
  try {
    const doc = pdf as {
      getDestination: (name: string) => Promise<unknown>
      getPageIndex: (ref: unknown) => Promise<number>
    }
    const explicit =
      typeof dest === 'string' ? await doc.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const pageIndex = await doc.getPageIndex(explicit[0])
    return pageIndex + 1
  } catch {
    return null
  }
}

function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page) || page < 1) return 1
  if (page > total) return total
  return Math.floor(page)
}
