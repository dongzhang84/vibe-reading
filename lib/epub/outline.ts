import 'server-only'
import { XMLParser } from 'fast-xml-parser'
import type JSZip from 'jszip'
import type { TocEntry } from '@/lib/pdf/outline'

// EPUB has two TOC formats:
//   - EPUB 3: <nav epub:type="toc"> in an XHTML file (manifest item with
//             properties="nav")
//   - EPUB 2: NCX file (manifest item with media-type
//             application/x-dtbncx+xml, also referenced by spine/@toc)
//
// We normalize both into TocEntry (defined in lib/pdf/outline) so the
// downstream "title + level + page" shape stays unified. For EPUB,
// `page` is reused as the spine index (0-based) of the chapter file the
// TOC entry points at — "page" has no native meaning in reflowable EPUB.

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  removeNSPrefix: true, // 'epub:type' → 'type'; 'dc:title' → 'title'
  // Make all child arrays consistent — easier traversal.
  isArray: (name) => ARRAY_TAGS.has(name),
})

const ARRAY_TAGS = new Set([
  'navPoint',
  'item',
  'itemref',
  'creator',
  'li',
  'ol',
])

function readText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)['#text']
    return typeof t === 'string' ? t : ''
  }
  return ''
}

function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// Resolve a spine entry's href into its 0-based spine index. Hrefs in the
// TOC are relative to the file containing the TOC; we strip the fragment
// and compare against the spine href map provided by parser.ts.
function resolveSpineIndex(
  href: string,
  spineHrefs: readonly string[],
  baseDir: string,
): number {
  const cleanHref = href.split('#')[0]
  if (!cleanHref) return -1
  const candidates = new Set<string>()
  candidates.add(cleanHref)
  candidates.add(joinPath(baseDir, cleanHref))
  candidates.add(decodeURIComponent(cleanHref))
  candidates.add(decodeURIComponent(joinPath(baseDir, cleanHref)))
  for (const c of candidates) {
    const idx = spineHrefs.indexOf(c)
    if (idx !== -1) return idx
  }
  // Last resort: suffix match (some TOCs use relative paths that don't
  // line up perfectly with the manifest href)
  for (let i = 0; i < spineHrefs.length; i++) {
    if (spineHrefs[i].endsWith(cleanHref)) return i
  }
  return -1
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

interface ParseArgs {
  zip: JSZip
  spineHrefs: readonly string[]
}

// ─── EPUB 3 — NAV ──────────────────────────────────────────────────────

interface NavLi {
  '@_class'?: string
  a?: { '@_href'?: string; '#text'?: string } | string
  span?: { '#text'?: string } | string
  ol?: { li?: NavLi[] } | { li?: NavLi[] }[]
}

function walkNav(
  list: NavLi[] | undefined,
  level: number,
  navDir: string,
  spineHrefs: readonly string[],
  out: TocEntry[],
): void {
  if (!list) return
  for (const li of list) {
    const a = typeof li.a === 'object' ? li.a : undefined
    const href = a?.['@_href']
    const titleRaw = readText(li.a) || readText(li.span)
    const title = flatten(titleRaw)
    if (title) {
      const page =
        href != null ? resolveSpineIndex(href, spineHrefs, navDir) : -1
      out.push({ title, level, page: page >= 0 ? page : 0 })
    }
    const inner = li.ol
    if (Array.isArray(inner)) {
      for (const sub of inner) walkNav(sub.li, level + 1, navDir, spineHrefs, out)
    } else if (inner) {
      walkNav(inner.li, level + 1, navDir, spineHrefs, out)
    }
  }
}

export async function parseNav(
  navPath: string,
  { zip, spineHrefs }: ParseArgs,
): Promise<TocEntry[]> {
  const file = zip.file(navPath)
  if (!file) return []
  const text = await file.async('string')
  const parsed = xml.parse(text) as Record<string, unknown>
  const navDir = navPath.includes('/') ? navPath.replace(/\/[^/]*$/, '') : ''

  // The toc <nav> can be at html > body > nav (or nested deeper). Find
  // any <nav> with epub:type="toc" (post removeNSPrefix → 'type').
  const out: TocEntry[] = []
  walkForToc(parsed, navDir, spineHrefs, out)
  return out
}

function walkForToc(
  node: unknown,
  navDir: string,
  spineHrefs: readonly string[],
  out: TocEntry[],
): void {
  if (!node || typeof node !== 'object') return
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'nav' && val && typeof val === 'object') {
      const navList = Array.isArray(val) ? val : [val]
      for (const nav of navList) {
        const navObj = nav as Record<string, unknown>
        if (navObj['@_type'] === 'toc' || navObj['@_type'] === undefined) {
          const ol = navObj.ol
          const lis = extractFirstOlLis(ol)
          walkNav(lis, 1, navDir, spineHrefs, out)
          if (out.length > 0) return
        }
      }
    }
    walkForToc(val, navDir, spineHrefs, out)
  }
}

function extractFirstOlLis(ol: unknown): NavLi[] | undefined {
  if (!ol) return undefined
  if (Array.isArray(ol)) {
    const first = ol[0] as Record<string, unknown> | undefined
    return first?.li as NavLi[] | undefined
  }
  return (ol as Record<string, unknown>).li as NavLi[] | undefined
}

// ─── EPUB 2 — NCX ──────────────────────────────────────────────────────

interface NcxNavPoint {
  '@_playOrder'?: string
  navLabel?: { text?: { '#text'?: string } | string } | { text: string }
  content?: { '@_src'?: string }
  navPoint?: NcxNavPoint[]
}

function walkNcx(
  nodes: NcxNavPoint[] | undefined,
  level: number,
  ncxDir: string,
  spineHrefs: readonly string[],
  out: TocEntry[],
): void {
  if (!nodes) return
  for (const np of nodes) {
    const labelNode = np.navLabel
    const text =
      typeof labelNode === 'object' && labelNode != null
        ? readText((labelNode as { text?: unknown }).text)
        : ''
    const title = flatten(text)
    const src = np.content?.['@_src']
    if (title) {
      const page =
        src != null ? resolveSpineIndex(src, spineHrefs, ncxDir) : -1
      out.push({ title, level, page: page >= 0 ? page : 0 })
    }
    walkNcx(np.navPoint, level + 1, ncxDir, spineHrefs, out)
  }
}

export async function parseNcx(
  ncxPath: string,
  { zip, spineHrefs }: ParseArgs,
): Promise<TocEntry[]> {
  const file = zip.file(ncxPath)
  if (!file) return []
  const text = await file.async('string')
  const parsed = xml.parse(text) as {
    ncx?: { navMap?: { navPoint?: NcxNavPoint[] } }
  }
  const ncxDir = ncxPath.includes('/') ? ncxPath.replace(/\/[^/]*$/, '') : ''
  const out: TocEntry[] = []
  walkNcx(parsed.ncx?.navMap?.navPoint, 1, ncxDir, spineHrefs, out)
  return out
}

// ─── Fallback ──────────────────────────────────────────────────────────

// When neither NAV nor NCX yields anything, synthesize a TOC from the
// spine: each spine entry becomes a level-1 entry with a placeholder
// title. parser.ts will replace the title with the first <h1>/<h2> found
// in each chapter body if any.
export function fallbackTocFromSpine(
  spineHrefs: readonly string[],
): TocEntry[] {
  return spineHrefs.map((_h, i) => ({
    title: `Chapter ${i + 1}`,
    level: 1,
    page: i,
  }))
}
