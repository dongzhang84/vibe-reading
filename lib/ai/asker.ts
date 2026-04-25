import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

const ASK_SCHEMA = {
  type: 'object',
  required: ['answer'],
  additionalProperties: false,
  properties: {
    answer: { type: 'string', maxLength: 1600 },
  },
} as const

/**
 * The reader has highlighted a passage in the PDF and clicked Ask. Explain
 * THAT passage — don't summarize the whole chapter. Keep it grounded in the
 * surrounding chapter content so the answer respects the author's framing.
 */
export async function askPassage(
  chapterTitle: string,
  chapterContent: string,
  selection: string,
): Promise<string> {
  const prompt = `A reader is reading a book chapter and has highlighted a specific passage. Explain ONLY that passage — its meaning, what it points at, and any term inside it that's worth knowing — using the surrounding chapter as context.

CHAPTER TITLE: ${chapterTitle}

CHAPTER CONTENT (for context):
${chapterContent.slice(0, 12000)}

THE READER'S HIGHLIGHTED PASSAGE:
"""
${selection.slice(0, 1500)}
"""

Hard rules:
- Explain THIS passage. Do NOT summarize the chapter.
- 2–4 short paragraphs max. Plain language. No bullet lists.
- If the passage references something defined elsewhere in the chapter, name it concretely instead of hand-waving.
- Do not reference the reader ("you", "your highlight"). Talk about the content.
- Return ONLY valid JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ask', strict: true, schema: ASK_SCHEMA },
    },
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { answer?: string }
  return parsed.answer ?? ''
}
