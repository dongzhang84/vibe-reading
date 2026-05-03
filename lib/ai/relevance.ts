import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

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

const BOOK_LEVEL_HANDLE = 'BOOK'

/**
 * Rule 2: identify which chapters are most likely to answer the reader's
 * question. The reason field must say "likely contains" / "discusses",
 * never "the author argues" — that's summarization and belongs to Brief.
 *
 * Why short handles ("H1", "H2", …) instead of UUIDs: gpt-4o-mini reliably
 * hallucinates UUIDs even with strict JSON schema (observed: it returned
 * IDs like "10c6b0b2-…", "11c6b0b2-…" — clearly fabricated by varying the
 * first byte). With an enum constraint over short handles the model is
 * locked to the real chapter list. Handles are mapped back to chapter_ids
 * post-parse.
 */
export async function matchChapters(
  input: RelevanceInput,
): Promise<ChapterMatch[]> {
  if (input.chapters.length === 0) return []

  const handleById = new Map<string, string>()
  const idByHandle = new Map<string, string>()
  input.chapters.forEach((c, i) => {
    const handle = `H${i + 1}`
    handleById.set(c.id, handle)
    idByHandle.set(handle, c.id)
  })
  const validHandles = [...idByHandle.keys(), BOOK_LEVEL_HANDLE]

  const block = input.chapters
    .map((c, i) => {
      const handle = `H${i + 1}`
      return `[${handle}] Chapter ${c.seq + 1}: ${c.title}\n${c.firstParagraph}`
    })
    .join('\n\n---\n\n')

  const SCHEMA = {
    type: 'object',
    required: ['matches'],
    additionalProperties: false,
    properties: {
      matches: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          required: ['chapter_handle', 'reason'],
          additionalProperties: false,
          properties: {
            chapter_handle: {
              type: 'string',
              enum: validHandles,
            },
            reason: { type: 'string', maxLength: 280 },
          },
        },
      },
    },
  } as const

  const prompt = `A reader is asking a question about a book. Identify which chapters are most likely to answer it.

QUESTION:
"${input.question}"

CHAPTERS (each prefixed with a handle in square brackets — e.g. [H1], [H2]):
${block}

For UP TO 5 chapters that seem relevant, return:
- chapter_handle: the bracketed handle of the chapter (e.g. "H1", "H7", "H14"). Use ONLY handles that appear above.
- reason: ONE SENTENCE describing what the chapter LIKELY CONTAINS related to the question. Use "likely contains", "discusses", "covers", "introduces". NEVER summarize what the author argues, proves, or concludes.

If the question is META (asks about the book as a whole — "what is this book about", "why does this book matter", "how does it compare to X"), return ONE entry with chapter_handle="${BOOK_LEVEL_HANDLE}" and a reason pointing the reader at intro + conclusion.

Rank by relevance (most relevant first). If fewer than 3 chapters are truly relevant, return fewer — DO NOT pad. Skip front-matter handles like "封面", "版权页", "目录" — those don't carry content even if their handle is in the list.

BAD reasons (NEVER do these):
- "The author argues that X causes Y"           ← summarizing
- "Proves method Z works in 5 steps"            ← summarizing
- "The three principles of effective practice"  ← summarizing

GOOD reasons (English):
- "Likely contains the author's definition of paradigm shift"
- "Discusses the historical context this question refers to"
- "Covers the chapter-end section distinguishing X from Y"

GOOD reasons (Chinese — equivalent phrasings):
- "可能包含作者对范式转移的定义"
- "讨论了该问题指向的历史背景"
- "涉及章末区分 X 与 Y 的部分"
- "介绍了..."

LANGUAGE: write each \`reason\` in the SAME LANGUAGE as the CHAPTERS above
(the language the book itself is written in). The reason describes what's IN
the chapter, so it must follow the chapter's language regardless of what
language the user used to ask. English book → English reasons even if the
question is in Chinese. Chinese book → Chinese reasons even if the question
is in English. Use the natural equivalent of "likely contains / discusses /
covers / introduces" in the book's language.

Return ONLY valid JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'relevance', strict: true, schema: SCHEMA },
    },
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as {
    matches?: Array<{ chapter_handle: string; reason: string }>
  }

  const out: ChapterMatch[] = []
  for (const m of parsed.matches ?? []) {
    if (m.chapter_handle === BOOK_LEVEL_HANDLE) {
      out.push({ chapterId: null, reason: m.reason })
      continue
    }
    const id = idByHandle.get(m.chapter_handle)
    if (id) {
      out.push({ chapterId: id, reason: m.reason })
    }
    // else: enum constraint should make this unreachable; silently drop
    // any stray handle the model invents.
  }
  return out
}
