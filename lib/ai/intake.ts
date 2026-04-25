import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

const INTAKE_SCHEMA = {
  type: 'object',
  required: ['overview', 'questions'],
  additionalProperties: false,
  properties: {
    overview: { type: 'string', maxLength: 800 },
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', maxLength: 200 },
    },
  },
} as const

export interface IntakeInput {
  title: string
  author: string | null
  tocTitles: string[]
  intro: string
  conclusion: string
}

export interface IntakeResult {
  overview: string
  questions: string[]
}

/**
 * Single LLM call that produces both the book overview and 3 starter questions.
 *
 * Why combine: they share the same context (TOC + intro + conclusion). Splitting
 * would double the cost and risk inconsistency between the overview and the
 * questions. Output is small (~400 tokens) so latency stays under ~5s.
 */
export async function analyzeBook(input: IntakeInput): Promise<IntakeResult> {
  const tocBlock =
    input.tocTitles.length > 0
      ? input.tocTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '(no TOC available)'

  const prompt = `Given a non-fiction book, produce an objective overview and 3 starter questions a thoughtful reader might bring.

BOOK:
Title: ${input.title}
Author: ${input.author ?? 'Unknown'}

TABLE OF CONTENTS:
${tocBlock}

INTRODUCTION (first ~2000 chars):
${input.intro.slice(0, 2000)}

CONCLUSION (last ~2000 chars):
${input.conclusion.slice(0, 2000)}

Output two fields:

1. overview: 80-120 words. OBJECTIVE description of what this book is about —
   subject, angle, who the book is for. Not a summary, not an evaluation.
   Avoid the word "summary".

2. questions: EXACTLY 3 questions a reader might actually type when picking up
   this book. Cover these three angles, one each:
     (a) Claim-level — "what is this book actually arguing?"
     (b) Stakes — "why does this book matter / how does it compare to X?"
     (c) Concrete — a specific concept or chapter-level question using a real
         term from this book's TOC

Each question under 150 characters. Pull specific vocabulary from the TOC and
intro to make the questions this-book-specific. Avoid generic "What is [topic]?"
phrasing.

Return ONLY JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'intake', strict: true, schema: INTAKE_SCHEMA },
    },
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  return JSON.parse(raw) as IntakeResult
}
