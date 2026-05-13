import 'server-only'
import { stripNul } from '@/lib/pdf/parser'

// Tags we keep when rebuilding the Read pane HTML. Anything outside this
// list is unwrapped (children kept, tag dropped). For <a>, we additionally
// only keep an href attribute and only if it's not a javascript: scheme.
const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'a',
  'br',
  'hr',
])

// Tags whose entire content we want to discard (the tag and everything
// inside). Script/style are XSS surface; head metadata is noise; img is
// v1-out per epub-support.md §不做.
const STRIP_WITH_CONTENT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'head',
  'meta',
  'link',
  'title',
])

const VOID_TAGS = new Set(['br', 'hr'])

// Pass 1: drop tags-with-content for every tag we don't want surviving.
// Regex is intentionally non-greedy and case-insensitive. Run repeatedly
// in case of nesting (e.g. <script><script></script></script>).
function stripDangerousBlocks(html: string): string {
  let out = html
  for (const tag of STRIP_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
    let prev: string
    do {
      prev = out
      out = out.replace(re, '')
    } while (out !== prev)
    // Self-closing form (<img/>, <meta />, …)
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  // HTML comments and CDATA — drop both.
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  return out
}

// Strip event-handler attributes (onclick, onerror, …) and javascript:
// URLs from anything that's still in the string. Belt to the allowlist's
// suspenders: even though we drop all attrs on most tags below, this
// defends against constructed strings that might slip through.
function stripDangerousAttrs(html: string): string {
  return html
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, 'about:blank#')
}

// Pull an href out of an attribute string, if present and safe.
function extractSafeHref(attrs: string): string | null {
  const m = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if (!m) return null
  const raw = (m[2] ?? m[3] ?? m[4] ?? '').trim()
  if (!raw) return null
  // Reject anything that even looks like a script URL after the
  // stripDangerousAttrs pass replaced obvious ones. Also reject
  // protocol-relative URLs (`//evil.com/`) since EPUB links rarely
  // need them and they're a foot-gun.
  if (
    /^(javascript|data|vbscript|file):/i.test(raw) ||
    raw.startsWith('//')
  ) {
    return null
  }
  return raw
}

function rewriteTag(
  isClose: boolean,
  tagName: string,
  attrs: string,
  selfClosing: boolean,
): string {
  const tag = tagName.toLowerCase()
  if (!ALLOWED_TAGS.has(tag)) return '' // unwrap: drop the tag, children stay
  if (isClose) return `</${tag}>`
  if (tag === 'a') {
    const href = extractSafeHref(attrs)
    return href ? `<a href="${escapeAttr(href)}">` : '<a>'
  }
  if (VOID_TAGS.has(tag) || selfClosing) return `<${tag}>`
  return `<${tag}>`
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const TAG_RE = /<(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/)?>/g

function rewriteAllTags(html: string): string {
  return html.replace(TAG_RE, (_match, slash, name, attrs, selfClose) => {
    return rewriteTag(Boolean(slash), name, attrs ?? '', Boolean(selfClose))
  })
}

// Collapse whitespace and decode the small set of HTML entities that
// reliably show up in plain-text EPUB content. We deliberately don't
// build a full entity table — EPUB body text is mostly literal Unicode
// already.
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITY_MAP[m] ?? m)
}

function tagsToText(html: string): string {
  // Replace block-level closing tags with newlines so paragraph breaks
  // survive the strip — keeps AI chapter content readable instead of one
  // huge run-on. <br> too.
  let s = html
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|pre|tr|td|th)\s*>/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[   ]/g, ' ') // various non-breaking spaces
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\n[ \t]+/g, '\n').replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

export interface Sanitized {
  text: string
  html: string
  firstHeading: string | null
  secondHeading: string | null
}

// Extract the first two <h1>–<h6> bodies for chapter-title fallback.
// Books like _Atomic Habits_ frequently split the chapter number and
// chapter name into two separate headings:
//   <h1>5</h1><h2>The Best Way to Start a New Habit</h2>
// We return both so the caller can stitch them when the first one is
// just a number.
function findLeadingHeadings(html: string): {
  first: string | null
  second: string | null
} {
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi
  const headings: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && headings.length < 2) {
    const raw = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (raw.length > 0) headings.push(decodeEntities(raw))
  }
  return {
    first: headings[0] ?? null,
    second: headings[1] ?? null,
  }
}

// EPUBs often split the chapter heading into a "chapter number" h-tag
// followed by a "chapter title" h-tag (e.g. `<h2>5</h2><h2>The Best Way
// …</h2>`). The book's own CSS gives the number a huge font, the title
// a smaller one. Since we strip class/style attrs (XSS safety), we lose
// that hierarchy unless we re-encode it semantically.
//
// Fix: promote any `<h2>` whose body is just a chapter number into `<h1>`.
// Paired with prose-h1 vs prose-h2 styling, this restores the visual
// "number on top, title below" relationship.
const CHAPTER_NUMBER_RE =
  /^(?:\d+[.:]?|chapter\s*\d+[.:]?|part\s*\d+[.:]?|第\s*[\d一二三四五六七八九十百零〇]+\s*[章节卷部篇][:：]?)$/i

function isChapterNumberHeading(body: string): boolean {
  const text = body
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0 && text.length <= 6 && CHAPTER_NUMBER_RE.test(text)
}

function promoteChapterNumberHeadings(html: string): string {
  return html.replace(
    /<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/gi,
    (full, body) => (isChapterNumberHeading(body) ? `<h1>${body}</h1>` : full),
  )
}

/**
 * Sanitize a raw XHTML chapter body into:
 *   - `text` : plain text for AI calls (intake / relevance / brief),
 *              normalized whitespace + decoded entities. NUL-stripped.
 *   - `html` : safe HTML for the Read pane — allowlisted tags only,
 *              no scripts/styles, no event handlers, no javascript:
 *              URLs, no img/svg/math. Chapter-number h2 tags are
 *              promoted to h1 so prose styling can give them visual
 *              weight (the book's own CSS hierarchy gets stripped by
 *              the attr-removal pass).
 *   - `firstHeading` / `secondHeading` : the first two <h1>–<h6> bodies,
 *              used to fall back to a chapter title when the OPF/NAV
 *              don't provide one (or are too terse).
 */
export function sanitize(xhtml: string): Sanitized {
  const stripped = stripDangerousBlocks(xhtml)
  const noAttrs = stripDangerousAttrs(stripped)
  const rewritten = stripNul(rewriteAllTags(noAttrs)).trim()
  const html = promoteChapterNumberHeadings(rewritten)
  const text = stripNul(tagsToText(noAttrs))
  const { first, second } = findLeadingHeadings(noAttrs)
  return { text, html, firstHeading: first, secondHeading: second }
}
