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
    one_sentence: { type: 'string', maxLength: 220 },
    key_claims: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', maxLength: 200 },
    },
    example: { type: 'string', maxLength: 500 },
    not_addressed: { type: 'string', maxLength: 360 },
  },
} as const

/**
 * Rule 3: 4-part structured brief. No prose, no intro/conclusion. The JSON
 * schema is strict so the model can't add or skip fields.
 */
export async function briefChapter(
  goal: string,
  chapterTitle: string,
  chapterContent: string,
): Promise<Brief> {
  const prompt = `You are writing a structured reading note. The reader has a goal and you are looking at one chapter. Return a compact 4-part brief as JSON.

READER'S GOAL:
"${goal}"

CHAPTER TITLE: ${chapterTitle}

CHAPTER CONTENT:
${chapterContent.slice(0, 12000)}

Output these exact 4 fields, nothing else:

1. one_sentence: The one-sentence version of this chapter's core claim (<= 220 chars).
2. key_claims: Exactly 3 claims the author makes. Each <= 200 chars.
3. example: One concrete example the author uses (<= 500 chars).
4. not_addressed: What the author does NOT address, that the reader — given the goal — might have expected (<= 360 chars).

Hard rules:
- Do NOT write an introduction, summary wrapper, or conclusion.
- Do NOT reference the reader or the goal by name ("you", "your goal"). Just state the content.
- Output exactly 3 items in key_claims, no more, no fewer.
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
  const parsed = JSON.parse(raw) as Brief
  return parsed
}
