import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface CheckResult {
  angles: string // one paragraph; another angle the chapter develops
  follow_up: string // optional Feynman-style question, may be empty
}

const CHECK_SCHEMA = {
  type: 'object',
  required: ['angles', 'follow_up'],
  additionalProperties: false,
  properties: {
    angles: { type: 'string', maxLength: 800 },
    follow_up: { type: 'string', maxLength: 280 },
  },
} as const

/**
 * The reader has restated a chapter in their own words. We are NOT grading
 * them. We are another reader in the room: they shared their take, we
 * offer one angle they didn't focus on, and maybe a question that pushes
 * the thinking further.
 *
 * Earlier version (got_right ✓ / missed ✗) read like a teacher marking
 * homework — the reader felt it as rude / school-test-ish. This rewrite
 * is the friendly-reading-partner version. Same Rule 4 enforcement (you
 * MUST restate before continuing), gentler conversation.
 */
export async function checkRestate(
  chapterContent: string,
  userRestate: string,
): Promise<CheckResult> {
  const prompt = `A reader just told you, in their own words, what a book chapter said. You are NOT a teacher grading them. You are another reader in the room — they shared their take, and you offer one angle from the chapter they didn't focus on. Optionally a question that pushes the thinking further.

CHAPTER CONTENT:
${chapterContent.slice(0, 12000)}

THE READER'S RESTATEMENT:
${userRestate}

Output two fields:

1. angles: One short paragraph (3-5 sentences). Add ONE angle the chapter develops that the reader didn't explicitly focus on — frame it as "the chapter also goes after X" or "an interesting twist is that…" — NOT as "you missed". If the reader's take is already complete, instead reflect what they captured: "you put your finger on [specific thing] — that's where the chapter rests".

2. follow_up: ONE Feynman-style question that would deepen the reader's understanding. Empty string if there isn't a genuinely good one. Examples: "Can you explain X without using the word Y?" "What would change if Z weren't true?". Only one question.

Hard rules:
- Do NOT grade. No "✓", no "you got X right", no "you missed Y".
- Do NOT paraphrase the chapter back to them. Add a new angle.
- Do NOT use second-person possessive about their work ("your understanding", "your restatement"). Talk about the content, not their performance.
- One paragraph for angles, not bullets, not lists.
- Use plain language. No academic jargon.

Return ONLY valid JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'check',
        strict: true,
        schema: CHECK_SCHEMA,
      },
    },
    temperature: 0.5,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as CheckResult
  return parsed
}
