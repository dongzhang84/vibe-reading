import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

const RELEVANCE_SCHEMA = {
  type: 'object',
  required: ['matches'],
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        required: ['chapter_id', 'reason'],
        additionalProperties: false,
        properties: {
          chapter_id: { type: ['string', 'null'] },
          reason: { type: 'string', maxLength: 280 },
        },
      },
    },
  },
} as const

export interface RelevanceChapterInput {
  id: string
  seq: number
  title: string
  firstParagraph: string
}

export interface RelevanceInput {
  question: string
  chapters: RelevanceChapterInput[]
}

export interface ChapterMatch {
  chapterId: string | null
  reason: string
}

/**
 * Rule 2: this is the matcher, not the summarizer. Reasons must say "likely
 * contains" / "discusses" — never "the author argues that…". A null chapter_id
 * means the question is meta (about the book as a whole) and should be answered
 * by intro + conclusion rather than a specific chapter.
 */
export async function matchChapters(
  input: RelevanceInput,
): Promise<ChapterMatch[]> {
  const block = input.chapters
    .map(
      (c) =>
        `[id: ${c.id}] Chapter ${c.seq + 1}: ${c.title}\n${c.firstParagraph}`,
    )
    .join('\n\n---\n\n')

  const prompt = `A reader is asking a question about a book. Identify which chapters are most likely to answer it.

QUESTION:
"${input.question}"

CHAPTERS (id, title, first paragraph):
${block}

For UP TO 5 chapters that seem relevant, return:
- chapter_id: the id above (exactly as shown, no edits)
- reason: ONE SENTENCE describing what the chapter LIKELY CONTAINS related to
  the question. Use "likely contains", "discusses", "covers", "introduces".
  NEVER summarize what the author argues, proves, or concludes.

If the question is META (asks about the book as a whole — "what is this book
about", "why does this book matter", "how does it compare to X"), return ONE
entry with chapter_id=null and a reason pointing the reader at intro +
conclusion.

Rank by relevance (most relevant first). If fewer than 3 chapters are truly
relevant, return fewer — DO NOT pad.

BAD reasons (NEVER do these):
- "The author argues that X causes Y"           ← summarizing
- "Proves method Z works in 5 steps"            ← summarizing
- "The three principles of effective practice"  ← summarizing

GOOD reasons:
- "Likely contains the author's definition of paradigm shift"
- "Discusses the historical context this question refers to"
- "Covers the chapter-end section distinguishing X from Y"

Return ONLY valid JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'relevance', strict: true, schema: RELEVANCE_SCHEMA },
    },
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as {
    matches?: Array<{ chapter_id: string | null; reason: string }>
  }
  return (parsed.matches ?? []).map((m) => ({
    chapterId: m.chapter_id,
    reason: m.reason,
  }))
}
