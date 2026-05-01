import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface Brief {
  one_sentence: string
  key_claims: string[] // exactly 3
  example: string
  not_addressed: string
}

const BRIEF_SCHEMA = {
  type: 'object',
  required: ['one_sentence', 'key_claims', 'example', 'not_addressed'],
  additionalProperties: false,
  properties: {
    one_sentence: { type: 'string', maxLength: 240 },
    key_claims: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', maxLength: 220 },
    },
    example: { type: 'string', maxLength: 500 },
    not_addressed: { type: 'string', maxLength: 360 },
  },
} as const

/**
 * Rule 3: 4-part structured brief. v2 drops the goal context — Brief is
 * chapter-level objective content, cached per chapter_id, not per
 * (chapter_id, goal). The reader's question is answered by relevance
 * mapping (left pane), not by tailoring the chapter brief.
 */
export async function briefChapter(
  chapterTitle: string,
  chapterContent: string,
): Promise<Brief> {
  const prompt = `You are writing a structured reading note for one chapter of a book.

CHAPTER TITLE: ${chapterTitle}

CHAPTER CONTENT:
${chapterContent.slice(0, 12000)}

Output exactly these 4 fields, nothing else:

1. one_sentence: The one-sentence version of this chapter's core claim (≤ 240 chars).
2. key_claims: Exactly 3 claims the author makes. Each ≤ 220 chars.
3. example: One concrete example the author uses (≤ 500 chars).
4. not_addressed: What the author does NOT address that a reader might expect (≤ 360 chars).

Hard rules:
- DO NOT write an introduction, summary wrapper, or conclusion.
- DO NOT reference the reader (no "you", "your", "we").
- Output exactly 3 items in key_claims, no more, no fewer.
- Plain language. No academic hedging.
- LANGUAGE: write all four fields in the SAME LANGUAGE as the CHAPTER CONTENT
  above. Chinese chapter → Chinese output (one_sentence / key_claims / example /
  not_addressed all in Chinese). English chapter → English output. If mixed,
  follow the dominant language of the chapter body.
- Return ONLY valid JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'brief',
        strict: true,
        schema: BRIEF_SCHEMA,
      },
    },
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  return JSON.parse(raw) as Brief
}
