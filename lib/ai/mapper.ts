import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface ChapterInput {
  id: string
  seq: number
  title: string
  firstParagraph: string // first ~500 chars only — never full chapter
}

export type MapVerdict = 'worth' | 'skip' | 'unanswered'

export interface MapResult {
  chapterId: string
  verdict: MapVerdict
  reason: string
}

/**
 * Rule 2: map chapters to the reader's goal, DO NOT summarize content.
 * Reason field describes what the chapter "likely contains" — never what
 * the author argues/proves/concludes.
 */
export async function mapChapters(
  goal: string,
  chapters: ChapterInput[],
): Promise<MapResult[]> {
  if (chapters.length === 0) return []

  const prompt = `You are a librarian. A reader has a goal and a book's table of contents.
Your job is to MAP chapters to the goal — NOT to summarize content.

READER'S GOAL:
"${goal}"

CHAPTERS (id, title, first paragraph):
${chapters
  .map(
    (c) =>
      `[${c.id}] Chapter ${c.seq}: ${c.title}\n${c.firstParagraph}`,
  )
  .join('\n\n')}

For each chapter, return ONE of:
- "worth": this chapter likely contains what the reader wants
- "skip": this chapter is unrelated to the reader's goal
- "unanswered": the reader's goal asks about something this book doesn't address (use sparingly, at most 1 chapter total across the book)

For the reason field (1 sentence, max ~120 chars):
- DO: describe what the chapter "likely contains" or "discusses"
- DO NOT: summarize what the author argues, concludes, or proves
- DO NOT: state facts from the chapter

Examples of GOOD reasons:
- "Likely contains the core definition the reader is looking for"
- "Discusses application scenarios of the goal topic"
- "Counter-arguments and limitations section"

Examples of BAD reasons (DO NOT DO THIS):
- "The author argues that X is caused by Y"       ← SUMMARIZING
- "Shows how to implement method Z in 5 steps"    ← SUMMARIZING
- "Explains the three pillars of success"         ← SUMMARIZING

Return ONLY valid JSON in this shape:
{"results":[{"chapterId":"<uuid>","verdict":"worth","reason":"..."}]}

Every chapter must appear in the results array exactly once, with the chapterId matching exactly.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { results?: unknown }
  if (!Array.isArray(parsed.results)) return []

  const validIds = new Set(chapters.map((c) => c.id))
  const out: MapResult[] = []
  for (const item of parsed.results) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const chapterId = typeof r.chapterId === 'string' ? r.chapterId : null
    const verdict = r.verdict
    const reason = typeof r.reason === 'string' ? r.reason.trim() : null
    if (!chapterId || !validIds.has(chapterId)) continue
    if (verdict !== 'worth' && verdict !== 'skip' && verdict !== 'unanswered') continue
    if (!reason) continue
    out.push({ chapterId, verdict, reason })
  }
  return out
}
