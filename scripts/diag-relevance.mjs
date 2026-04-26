// Run relevance AI directly to inspect what gpt-4o-mini returns.
// Mirrors lib/ai/relevance.ts (handle-based enum schema).
//
// Usage: node scripts/diag-relevance.mjs <bookId> "<question>"

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import OpenAI from 'openai'

const env = readFileSync(resolve('.env.local'), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .reduce((acc, l) => {
    const [k, ...rest] = l.split('=')
    acc[k.trim()] = rest.join('=').trim()
    return acc
  }, {})
process.env.OPENAI_API_KEY = env.OPENAI_API_KEY

const [bookId, ...rest] = process.argv.slice(2)
const question = rest.join(' ')
if (!bookId || !question) {
  console.error('Usage: node scripts/diag-relevance.mjs <bookId> "<question>"')
  process.exit(1)
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'vr' } },
)

const { data: chapters } = await sb
  .from('chapters')
  .select('id, seq, title, content, level')
  .eq('book_id', bookId)
  .lte('level', 1)
  .order('seq')

if (!chapters?.length) {
  console.error('no chapters found')
  process.exit(1)
}

const BOOK_LEVEL_HANDLE = 'BOOK'
const idByHandle = new Map()
chapters.forEach((c, i) => idByHandle.set(`H${i + 1}`, c.id))
const validHandles = [...idByHandle.keys(), BOOK_LEVEL_HANDLE]

const block = chapters
  .map((c, i) => `[H${i + 1}] Chapter ${c.seq + 1}: ${c.title}\n${c.content.slice(0, 600)}`)
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
          chapter_handle: { type: 'string', enum: validHandles },
          reason: { type: 'string', maxLength: 280 },
        },
      },
    },
  },
}

const prompt = `A reader is asking a question about a book. Identify which chapters are most likely to answer it.

QUESTION:
"${question}"

CHAPTERS (each prefixed with a handle in square brackets — e.g. [H1], [H2]):
${block}

For UP TO 5 chapters that seem relevant, return:
- chapter_handle: the bracketed handle of the chapter (e.g. "H1", "H7", "H14"). Use ONLY handles that appear above.
- reason: ONE SENTENCE describing what the chapter LIKELY CONTAINS related to the question. Use "likely contains", "discusses", "covers", "introduces". NEVER summarize what the author argues, proves, or concludes.

If the question is META (asks about the book as a whole — "what is this book about", "why does this book matter", "how does it compare to X"), return ONE entry with chapter_handle="${BOOK_LEVEL_HANDLE}" and a reason pointing the reader at intro + conclusion.

Rank by relevance (most relevant first). If fewer than 3 chapters are truly relevant, return fewer — DO NOT pad. Skip front-matter handles like "封面", "版权页", "目录" — those don't carry content even if their handle is in the list.

Return ONLY valid JSON matching the schema.`

console.log(`\n${chapters.length} chapters input. Valid handles: H1…H${chapters.length} + ${BOOK_LEVEL_HANDLE}\n`)
console.log('→ calling gpt-4o-mini...')
const openai = new OpenAI()
const t0 = Date.now()
const res = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'relevance', strict: true, schema: SCHEMA },
  },
  temperature: 0.2,
  messages: [{ role: 'user', content: prompt }],
})
console.log(`← ${Date.now() - t0}ms\n`)

const raw = res.choices[0]?.message?.content ?? '{}'
const parsed = JSON.parse(raw)
console.log(`MATCHES (${parsed.matches?.length ?? 0}):`)
for (const m of parsed.matches ?? []) {
  if (m.chapter_handle === BOOK_LEVEL_HANDLE) {
    console.log(`  ✓  BOOK-level (chapter_id=null)`)
  } else {
    const id = idByHandle.get(m.chapter_handle)
    const ch = chapters.find((c) => c.id === id)
    console.log(`  ${id ? '✓' : '✗'}  ${m.chapter_handle} → "${ch?.title ?? 'UNKNOWN'}"`)
  }
  console.log(`     "${m.reason}"`)
}
