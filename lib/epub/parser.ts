import 'server-only'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

import type { TocEntry } from '@/lib/pdf/outline'
import { splitIntoChapters } from '@/lib/pdf/parser'
import { sanitize } from './sanitize'
import {
  fallbackTocFromSpine,
  parseNav,
  parseNcx,
} from './outline'
import { isDrmProtected, MIN_TEXT_THRESHOLD } from './detect'

// ─── Public shape ──────────────────────────────────────────────────────

export interface EpubChapter {
  seq: number
  title: string
  content: string // plain text — fed to AI (intake / relevance / brief)
  contentHtml: string // sanitized HTML — rendered in the Read pane
  level: 1
  pageStart: number // = spine index, since EPUB has no native "page"
  pageEnd: number
}

export interface ParsedEpub {
  title: string
  author: string | null
  toc: TocEntry[]
  chapters: EpubChapter[]
  spineLength: number
}

// ─── Error class so the finalize route can give a precise 4xx ──────────

export type EpubErrorCode =
  | 'invalid_container'
  | 'no_opf'
  | 'invalid_opf'
  | 'drm_protected'
  | 'empty_spine'
  | 'image_only'
  | 'parse_failed'

export class EpubParseError extends Error {
  code: EpubErrorCode
  constructor(code: EpubErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

// ─── XML parser ────────────────────────────────────────────────────────

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (name) => ARRAY_TAGS.has(name),
})

const ARRAY_TAGS = new Set(['rootfile', 'item', 'itemref', 'creator'])

// ─── Helpers ───────────────────────────────────────────────────────────

function readText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(readText).filter(Boolean).join(', ')
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)['#text']
    return typeof t === 'string' ? t : ''
  }
  return ''
}

function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function joinPath(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1)
  if (!base) return rel
  const parts = `${base}/${rel}`.split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

// ─── 1. container.xml → OPF path ───────────────────────────────────────

async function readOpfPath(zip: JSZip): Promise<string> {
  const file = zip.file('META-INF/container.xml')
  if (!file) {
    throw new EpubParseError(
      'invalid_container',
      'EPUB missing META-INF/container.xml',
    )
  }
  const raw = await file.async('string')
  const parsed = xml.parse(raw) as {
    container?: { rootfiles?: { rootfile?: { '@_full-path'?: string }[] } }
  }
  const rootfile = parsed.container?.rootfiles?.rootfile?.[0]
  const path = rootfile?.['@_full-path']
  if (!path) {
    throw new EpubParseError(
      'no_opf',
      'EPUB container.xml has no rootfile pointing to an OPF',
    )
  }
  return path
}

// ─── 2. OPF → metadata + manifest + spine ──────────────────────────────

interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string
}

interface OpfData {
  title: string
  author: string | null
  manifest: Map<string, ManifestItem>
  spineIds: string[]
  navItemId: string | null
  ncxItemId: string | null
  opfDir: string
}

async function readOpf(zip: JSZip, opfPath: string): Promise<OpfData> {
  const file = zip.file(opfPath)
  if (!file) {
    throw new EpubParseError('no_opf', `OPF file not found at ${opfPath}`)
  }
  const raw = await file.async('string')
  const parsed = xml.parse(raw) as {
    package?: {
      metadata?: Record<string, unknown>
      manifest?: { item?: ManifestItemNode[] }
      spine?: { '@_toc'?: string; itemref?: { '@_idref'?: string }[] }
    }
  }
  const pkg = parsed.package
  if (!pkg) {
    throw new EpubParseError('invalid_opf', 'OPF has no <package> root')
  }

  const meta = pkg.metadata ?? {}
  const title =
    flatten(readText(meta.title)) || 'Untitled'
  const creators = meta.creator
  const author =
    flatten(
      Array.isArray(creators)
        ? creators.map(readText).filter(Boolean).join(', ')
        : readText(creators),
    ) || null

  const manifest = new Map<string, ManifestItem>()
  let navItemId: string | null = null
  let ncxItemId: string | null = null
  const rawItems = pkg.manifest?.item ?? []
  for (const it of rawItems) {
    const id = it['@_id']
    const href = it['@_href']
    if (!id || !href) continue
    const mediaType = it['@_media-type'] ?? ''
    const properties = it['@_properties'] ?? ''
    manifest.set(id, { id, href, mediaType, properties })
    if (properties.split(/\s+/).includes('nav')) navItemId = id
    if (mediaType === 'application/x-dtbncx+xml') ncxItemId = id
  }

  const spineIds = (pkg.spine?.itemref ?? [])
    .map((r) => r['@_idref'])
    .filter((x): x is string => typeof x === 'string')

  // The spine can also reference an NCX via @toc on the spine element —
  // honor that if no media-type-based NCX was found.
  const spineNcx = pkg.spine?.['@_toc']
  if (!ncxItemId && typeof spineNcx === 'string' && manifest.has(spineNcx)) {
    ncxItemId = spineNcx
  }

  return {
    title,
    author,
    manifest,
    spineIds,
    navItemId,
    ncxItemId,
    opfDir: dirOf(opfPath),
  }
}

interface ManifestItemNode {
  '@_id'?: string
  '@_href'?: string
  '@_media-type'?: string
  '@_properties'?: string
}

// ─── 3. Walk spine → chapters ──────────────────────────────────────────

interface RawChapter {
  href: string
  text: string
  html: string
  firstHeading: string | null
  secondHeading: string | null
}

async function walkSpine(
  zip: JSZip,
  opf: OpfData,
): Promise<{ chapters: RawChapter[]; spineHrefs: string[] }> {
  const chapters: RawChapter[] = []
  const spineHrefs: string[] = []

  for (const id of opf.spineIds) {
    const item = opf.manifest.get(id)
    if (!item) continue
    if (
      item.mediaType &&
      !item.mediaType.includes('xhtml') &&
      !item.mediaType.includes('html')
    ) {
      // skip non-html spine items (rare but possible)
      continue
    }
    const fullPath = joinPath(opf.opfDir, item.href)
    spineHrefs.push(fullPath)
    const file = zip.file(fullPath) ?? zip.file(decodeURIComponent(fullPath))
    if (!file) continue
    const raw = await file.async('string')
    const { text, html, firstHeading, secondHeading } = sanitize(raw)
    chapters.push({ href: fullPath, text, html, firstHeading, secondHeading })
  }
  return { chapters, spineHrefs }
}

// ─── 4. Title resolution ───────────────────────────────────────────────

// Body heading "5" / "10" / "Chapter 4" tells us almost nothing on its
// own — the EPUB author meant for the chapter number to live alongside a
// separate descriptive heading (and frequently put one in the next h-tag).
// When we see one of these, prefer the TOC label if available, else
// stitch the second heading on.
function looksLikeChapterNumberOnly(s: string): boolean {
  const t = s.trim()
  if (t.length === 0) return false
  if (/^\d+[.:]?$/.test(t)) return true // "5", "10:", "12."
  if (t.length <= 4) return true // very short — almost certainly not the full title
  if (/^(chapter|part)\s*\d+[:.]?$/i.test(t)) return true
  if (/^第\s*[\d一二三四五六七八九十百零〇]+\s*[章节卷部篇][:：]?$/.test(t)) return true
  return false
}

function titleForChapter(
  raw: RawChapter,
  seq: number,
  spineToTocTitle: Map<number, string>,
): string {
  // 1) TOC entry — author-authoritative. Books like _Atomic Habits_ put
  //    "5: The Best Way to Start a New Habit" here; preferring this over
  //    the body's <h1>5</h1> fixes the "list shows only numbers" bug.
  const tocTitle = spineToTocTitle.get(seq)
  if (tocTitle && tocTitle.length > 0) return tocTitle

  // 2) Body heading. If the first is just a chapter number and a second
  //    heading exists, stitch them so the title carries the descriptive
  //    half ("5: The Best Way to Start a New Habit").
  if (raw.firstHeading) {
    if (
      raw.secondHeading &&
      looksLikeChapterNumberOnly(raw.firstHeading)
    ) {
      const num = raw.firstHeading.trim().replace(/[.:]$/, '')
      return `${num}: ${raw.secondHeading}`
    }
    return raw.firstHeading
  }

  // 3) Generic fallback.
  return `Chapter ${seq + 1}`
}

// ─── 5. Single-XHTML edge case ─────────────────────────────────────────

const SINGLE_XHTML_TEXT_THRESHOLD = 30_000

function isSingleXhtmlBook(chapters: RawChapter[]): boolean {
  return (
    chapters.length === 1 && chapters[0].text.length > SINGLE_XHTML_TEXT_THRESHOLD
  )
}

function splitSingleXhtml(raw: RawChapter): EpubChapter[] {
  const split = splitIntoChapters(raw.text)
  if (split.length === 0) {
    // Couldn't split — keep as one big chapter (still better than 0).
    return [
      {
        seq: 0,
        title: 'Full text',
        content: raw.text,
        contentHtml: raw.html,
        level: 1,
        pageStart: 0,
        pageEnd: 0,
      },
    ]
  }
  // We lose the HTML structure here — Read pane will fall back to plain
  // text wrapped in <p>. Acceptable for the rare "整本一文件" books per
  // docs/epub-support.md §E3.
  return split.map((c, i) => ({
    seq: i,
    title: c.title,
    content: c.content,
    contentHtml: `<p>${escapeHtml(c.content).replace(/\n\n+/g, '</p><p>')}</p>`,
    level: 1 as const,
    pageStart: 0,
    pageEnd: 0,
  }))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── 6. Chapter coalesce ───────────────────────────────────────────────
//
// EPUBs love to split structurally: cover, title page, copyright,
// dedication, each part divider, each chapter — all separate XHTML
// files. A book like _Atomic Habits_ ends up with 70+ "chapters" of
// which most are 0-byte covers or 1-line part dividers (e.g.
// "THE 1ST LAW / Make It Obvious").
//
// We:
//   1. Drop chapters with zero content (Cover / Title / blank pages).
//   2. Fold short chapters (< MIN_BODY_CHARS) forward into the next
//      substantial chapter. The short chapter's title and body become
//      a header at the top of the merged result. This keeps part-
//      divider context attached to the chapter it introduces, and
//      stops the AI relevance ranker from wasting matches on dividers.
//
// The result: chapter titles in the UI are the substantive ones, and
// clicking Read on a chapter gives the reader the actual chapter
// content — divider heading included — instead of just a section page.

const MIN_BODY_CHARS = 500

function coalesceChapters(chapters: EpubChapter[]): EpubChapter[] {
  // 1. Drop empties.
  const nonEmpty = chapters.filter((c) => c.content.trim().length > 0)
  if (nonEmpty.length === 0) return []

  // 2. Fold shorts forward.
  const result: EpubChapter[] = []
  let pending: EpubChapter[] = []

  for (const c of nonEmpty) {
    if (c.content.length < MIN_BODY_CHARS) {
      pending.push(c)
      continue
    }
    // Substantial chapter — flush any pending shorts as a header on c.
    if (pending.length > 0) {
      const prefixHtml = pending
        .map(
          (p) =>
            `<h2>${escapeHtml(p.title)}</h2>\n${p.contentHtml}`,
        )
        .join('\n')
      const prefixText = pending
        .map((p) => `${p.title}\n\n${p.content}`)
        .join('\n\n')
      result.push({
        ...c,
        content: `${prefixText}\n\n${c.content}`,
        contentHtml: `${prefixHtml}\n${c.contentHtml}`,
      })
      pending = []
    } else {
      result.push(c)
    }
  }

  // 3. Trailing shorts (book ends with a short epilogue / about-the-author
  // page): collapse into one final chapter so they're not lost.
  if (pending.length > 0) {
    const last = pending[pending.length - 1]
    result.push({
      ...last,
      title: pending[0].title,
      content: pending
        .map((p) => `${p.title}\n\n${p.content}`)
        .join('\n\n'),
      contentHtml: pending
        .map((p) => `<h2>${escapeHtml(p.title)}</h2>\n${p.contentHtml}`)
        .join('\n'),
    })
  }

  // 4. Re-seq + reset page indices to the new order.
  return result.map((c, i) => ({
    ...c,
    seq: i,
    pageStart: i,
    pageEnd: i,
  }))
}

// ─── Main entry ────────────────────────────────────────────────────────

export async function parseEpub(buffer: Buffer): Promise<ParsedEpub> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch (err) {
    throw new EpubParseError(
      'parse_failed',
      `Not a valid ZIP/EPUB archive: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (isDrmProtected(zip)) {
    throw new EpubParseError(
      'drm_protected',
      'EPUB is DRM-protected (META-INF/encryption.xml present)',
    )
  }

  const opfPath = await readOpfPath(zip)
  const opf = await readOpf(zip, opfPath)

  if (opf.spineIds.length === 0) {
    throw new EpubParseError(
      'empty_spine',
      'OPF spine has no itemref entries',
    )
  }

  const { chapters: rawChapters, spineHrefs } = await walkSpine(zip, opf)
  if (rawChapters.length === 0) {
    throw new EpubParseError(
      'empty_spine',
      'No readable XHTML spine entries found',
    )
  }

  // Resolve TOC. NAV (EPUB 3) preferred; NCX (EPUB 2) fallback.
  let toc: TocEntry[] = []
  if (opf.navItemId) {
    const item = opf.manifest.get(opf.navItemId)
    if (item) {
      const navPath = joinPath(opf.opfDir, item.href)
      toc = await parseNav(navPath, { zip, spineHrefs })
    }
  }
  if (toc.length === 0 && opf.ncxItemId) {
    const item = opf.manifest.get(opf.ncxItemId)
    if (item) {
      const ncxPath = joinPath(opf.opfDir, item.href)
      toc = await parseNcx(ncxPath, { zip, spineHrefs })
    }
  }
  if (toc.length === 0) {
    toc = fallbackTocFromSpine(spineHrefs)
  }

  // Map spine index → TOC title (for chapter-title fallback when there's
  // no <h1>/<h2> in the body).
  const spineToTocTitle = new Map<number, string>()
  for (const entry of toc) {
    if (entry.page >= 0 && !spineToTocTitle.has(entry.page)) {
      spineToTocTitle.set(entry.page, entry.title)
    }
  }

  // Single-XHTML book fallback (整本一文件).
  let finalChapters: EpubChapter[]
  if (isSingleXhtmlBook(rawChapters)) {
    finalChapters = splitSingleXhtml(rawChapters[0])
  } else {
    const expanded = rawChapters.map((raw, i) => ({
      seq: i,
      title: titleForChapter(raw, i, spineToTocTitle),
      content: raw.text,
      contentHtml: raw.html,
      level: 1 as const,
      pageStart: i,
      pageEnd: i,
    }))
    // Fold short part-dividers / front-matter forward into substantive
    // chapters so the chapter list isn't 70+ rows of fragments.
    finalChapters = coalesceChapters(expanded)
  }

  // Image-only / no-text-layer guard. Mirror the PDF scan-only friendly
  // 422 path — sum plain text across all chapters; if below threshold,
  // bail out so finalize can return the canonical message.
  const totalText = finalChapters.reduce((n, c) => n + c.content.length, 0)
  if (totalText < MIN_TEXT_THRESHOLD) {
    throw new EpubParseError(
      'image_only',
      `EPUB text content (${totalText} chars) below threshold — likely image-only`,
    )
  }

  return {
    title: opf.title,
    author: opf.author,
    toc,
    chapters: finalChapters,
    spineLength: opf.spineIds.length,
  }
}
