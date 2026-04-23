import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface CheckResult {
  got_right: string[] // up to 5
  missed: string[] // up to 5
  follow_up: string // may be empty string
}

const CHECK_SCHEMA = {
  type: 'object',
  required: ['got_right', 'missed', 'follow_up'],
  additionalProperties: false,
  properties: {
    got_right: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', maxLength: 280 },
    },
    missed: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', maxLength: 360 },
    },
    follow_up: { type: 'string', maxLength: 240 },
  },
} as const

/**
 * Checks the reader's restatement against the source chapter. Strict tutor
 * persona — specific observations, never generic ("great try!") and never a
 * paraphrase of the chapter. If the reader nailed it, missed can be empty;
 * if wildly off, got_right can be empty.
 */
export async function checkRestate(
  chapterContent: string,
  userRestate: string,
): Promise<CheckResult> {
  const prompt = `You are a strict but not harsh tutor. A reader has just restated a book chapter in their own words. Your job is to check their understanding — be specific, not generic.

CHAPTER CONTENT:
${chapterContent.slice(0, 12000)}

READER'S RESTATEMENT:
${userRestate}

Output these fields:

1. got_right: Specific points the reader captured correctly. Up to 5 items, each brief (<= 280 chars). Reference what they actually said. If the reader wrote nothing meaningful, return an empty array.
2. missed: Important things they missed or misunderstood. Up to 5 items, each a single actionable sentence (<= 360 chars). Be specific — NOT "you missed some context" but "you didn't mention that the author distinguishes observational vs experimental data". If they nailed it, return an empty array.
3. follow_up: ONE optional Feynman-style follow-up question that would deepen understanding (<= 240 chars). Example: "Can you explain X without using the word Y?". Return empty string if no good question.

Hard rules:
- Do NOT give psychological praise ("great try!", "you're doing well"). Just the work.
- Do NOT paraphrase the chapter at the reader. Point to what they said vs what the text said.
- Do NOT pad — fewer high-quality items beats 5 weak ones.
- Return ONLY valid JSON matching the schema.`

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
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as CheckResult
  return parsed
}
