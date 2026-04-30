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

const FRONT_MATTER_PATTERNS: readonly RegExp[] = [
  /^cover\b/i,
  /^title\s+page\b/i,
  /^half[-\s]+title\b/i,
  /^copyright\b/i,
  /^dedication\b/i,
  /^about\s+the\s+author\b/i,
  /^praise\b/i,
  /^reviews?\b/i,
  /^acknowledg(?:e)?ments?\b/i,
  /^bibliography\b/i,
  /^glossary\b/i,
  /^index\b/i,
  /^notes?\s*$/i,
  /^colophon\b/i,
  /^封面/,
  /^版权/,
  /^致谢/,
  /^索引/,
]

const PART_DIVIDER_PATTERNS: readonly RegExp[] = [
  /^part\s+[IVX\d]+\b/i,
  /^第\s*[\d一二三四五六七八九十百零〇]+\s*(?:篇|部)/,
]

function isFrontMatter(title: string): boolean {
  const t = title.trim()
  return FRONT_MATTER_PATTERNS.some((re) => re.test(t))
}

function isPartDivider(title: string): boolean {
  const t = title.trim()
  return PART_DIVIDER_PATTERNS.some((re) => re.test(t))
}

/**
 * Decide which TOC level should be the source of chapter rows. For most
 * non-fiction, level 1 IS the chapter list. Some books use level 1 as Part
 * dividers ("Part I. Foundations") with real chapters at level 2 — slicing
 * by level 1 there produces giant blobs that defeat relevance AI (each
 * "chapter" contains an entire Part, ~80+ pages, so AI returns all parts
 * for any question).
 *
 * Heuristic: drop obvious front-matter from level 1, then if ≥60% of what's
 * left looks like a Part divider AND there are ≥3 level-2 entries, descend.
 */
function pickChapterSourceLevel(flat: TocEntry[]): 1 | 2 {
  const level1Real = flat.filter(
    (e) => e.level === 1 && !isFrontMatter(e.title),
  )
  const level2 = flat.filter((e) => e.level === 2)
  if (level1Real.length === 0) return 1
  const partRatio =
    level1Real.filter((e) => isPartDivider(e.title)).length /
    level1Real.length
  if (partRatio >= 0.6 && level2.length >= 3) return 2
  return 1
}

/**
 * Pull the embedded outline (TOC) from a PDF and slice per-chapter content
 * using resolved page numbers. Returns null when the PDF has no outline or
 * the outline produces too few real chapters — caller falls back to regex.
 *
 * Real chapters only land in the chapters list; obvious front-matter (Cover,
 * Copyright, Index, …) and Part dividers stay in `toc` for Book Home display
 * but are excluded from the rows fed to relevance AI.
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

    const sourceLevel = pickChapterSourceLevel(flat)

    // Chapter sources. When descending to level 2, also keep non-Part
    // level-1 entries (e.g. "Preface", "Introduction") as chapters so their
    // content isn't lost.
    const sources = flat.filter((e) => {
      if (isFrontMatter(e.title)) return false
      if (sourceLevel === 1) return e.level === 1
      if (e.level === 1) return !isPartDivider(e.title)
      return e.level === 2
    })
    if (sources.length < MIN_TOP_CHAPTERS) return null

    // Boundaries: any non-front-matter entry's page acts as a chapter end,
    // regardless of level. Stops a chapter from swallowing the next Part
    // divider page or sibling chapter when descending levels.
    const boundaries = flat
      .filter((e) => !isFrontMatter(e.title))
      .map((e) => e.page)
      .sort((a, b) => a - b)

    const totalPages = (pdf as unknown as { numPages: number }).numPages

    const { text: pages } = await extractText(pdf, { mergePages: false })
    const pageArr = Array.isArray(pages) ? pages : [pages as string]

    const chapters: OutlineChapter[] = []
    for (const cur of sources) {
      const pageStart = clampPage(cur.page, totalPages)
      const nextBoundary = boundaries.find((p) => p > cur.page)
      const pageEnd = nextBoundary
        ? clampPage(nextBoundary - 1, totalPages)
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
