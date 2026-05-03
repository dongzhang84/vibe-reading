/**
 * Cheap heuristic: is the text dominantly Chinese?
 *
 * We check the ratio of CJK Unified Ideographs (U+4E00–U+9FFF) over total
 * non-whitespace characters. A 30% threshold catches Chinese books with
 * embedded English terms (very common in tech / academic Chinese writing)
 * while still classifying English books with sprinkled Chinese names as
 * English. Good enough for picking UI copy language; not a real
 * language detector.
 */
export function isChineseDominant(
  text: string | null | undefined,
): boolean {
  if (!text) return false
  const cjk = text.match(/[一-鿿]/g)
  const cjkCount = cjk ? cjk.length : 0
  const total = text.replace(/\s/g, '').length
  if (total === 0) return false
  return cjkCount / total >= 0.3
}

export type BookLang = 'zh' | 'en'

/**
 * Pick the locale for UI copy that should match the book's language
 * (e.g. the static Orientation prompt on Book Home). The `overview` field
 * is the most reliable signal because it's AI-generated to match the
 * book's body. Fall back to title if overview is missing.
 */
export function pickBookLang(input: {
  overview: string | null
  title: string
}): BookLang {
  if (isChineseDominant(input.overview)) return 'zh'
  if (input.overview && input.overview.trim().length > 0) return 'en'
  // overview missing → fall back to title
  return isChineseDominant(input.title) ? 'zh' : 'en'
}
