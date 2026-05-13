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
}

// Extract the first <h1>/<h2> body for chapter-title fallback.
function findFirstHeading(html: string): string | null {
  const m = html.match(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i)
  if (!m) return null
  const raw = m[2]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return raw.length > 0 ? decodeEntities(raw) : null
}

/**
 * Sanitize a raw XHTML chapter body into:
 *   - `text` : plain text for AI calls (intake / relevance / brief),
 *              normalized whitespace + decoded entities. NUL-stripped.
 *   - `html` : safe HTML for the Read pane — allowlisted tags only,
 *              no scripts/styles, no event handlers, no javascript:
 *              URLs, no img/svg/math.
 *   - `firstHeading` : the first <h1>/<h2> body, used to fall back to a
 *                       chapter title when the OPF/NAV don't provide one.
 */
export function sanitize(xhtml: string): Sanitized {
  const stripped = stripDangerousBlocks(xhtml)
  const noAttrs = stripDangerousAttrs(stripped)
  const html = stripNul(rewriteAllTags(noAttrs)).trim()
  const text = stripNul(tagsToText(noAttrs))
  const firstHeading = findFirstHeading(noAttrs)
  return { text, html, firstHeading }
}
