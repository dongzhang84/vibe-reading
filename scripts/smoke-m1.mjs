// M1 smoke test: hit /api/upload with a local PDF against local dev server,
// then SQL-verify the resulting books row has toc/overview/suggested_questions.
//
// Usage: node scripts/smoke-m1.mjs <path-to-test.pdf>
// Prereq: dev server running on http://localhost:3000

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve('.env.local'), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .reduce((acc, l) => {
    const [k, ...rest] = l.split('=')
    acc[k.trim()] = rest.join('=').trim()
    return acc
  }, {})

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/smoke-m1.mjs <path-to-test.pdf>')
  process.exit(1)
}

const baseUrl = process.env.SMOKE_URL ?? 'http://localhost:3000'

console.log(`\n→ POST ${baseUrl}/api/upload (file: ${pdfPath})`)
const file = new File([readFileSync(pdfPath)], pdfPath.split('/').pop(), {
  type: 'application/pdf',
})
const form = new FormData()
form.append('file', file)

const t0 = Date.now()
const res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: form })
const elapsed = Date.now() - t0
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`✗ upload failed (${res.status}, ${elapsed}ms):`, body)
  process.exit(1)
}
const bookId = body.bookId
console.log(`✓ upload OK (${elapsed}ms) bookId=${bookId}`)

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'vr' } },
)

const { data: book, error } = await sb
  .from('books')
  .select('id, title, author, page_count, toc, overview, suggested_questions')
  .eq('id', bookId)
  .single()

if (error) {
  console.error('✗ DB lookup failed:', error.message)
  process.exit(1)
}

console.log('\n┌─ M1 BOOK ROW ──────────────────────────────────────────────────────')
console.log(`│ title:      ${book.title}`)
console.log(`│ author:     ${book.author ?? '(null)'}`)
console.log(`│ page_count: ${book.page_count}`)
console.log(`│ toc:        ${book.toc ? `[${book.toc.length} entries]` : '(null — fallback)'}`)
if (book.toc && book.toc.length > 0) {
  console.log(`│   first:    "${book.toc[0].title}" (level ${book.toc[0].level}, p.${book.toc[0].page})`)
}
console.log(`│ overview:   ${book.overview ? `${book.overview.slice(0, 100)}...` : '(null)'}`)
console.log(`│ questions:  ${book.suggested_questions ? `[${book.suggested_questions.length}]` : '(null)'}`)
if (book.suggested_questions) {
  for (const q of book.suggested_questions) console.log(`│   → ${q}`)
}
console.log('└────────────────────────────────────────────────────────────────────')

const { data: chapters } = await sb
  .from('chapters')
  .select('seq, title, level, page_start, page_end, content')
  .eq('book_id', bookId)
  .order('seq')

console.log(`\n${chapters?.length ?? 0} chapter rows:`)
for (const c of chapters ?? []) {
  console.log(`  ${c.seq}. lv${c.level}  ${c.page_start ?? '-'}–${c.page_end ?? '-'}  "${c.title}" (${c.content.length} chars)`)
}

// TOC null is OK — means PDF had no embedded outline and fallback splitter
// was engaged. The contract M1 must satisfy: book row created, intake AI
// produced overview + 3 questions, at least one chapter written.
const intakeOK =
  book.overview !== null &&
  Array.isArray(book.suggested_questions) &&
  book.suggested_questions.length === 3
const chaptersOK = (chapters?.length ?? 0) >= 1
const tocPath = book.toc !== null ? 'outline' : 'fallback (regex/size)'

if (intakeOK && chaptersOK) {
  console.log(`\n✅ M1 smoke PASS  (TOC path: ${tocPath})\n`)
} else {
  console.log('\n❌ M1 smoke FAIL')
  if (!intakeOK) console.log('   - intake AI did not produce overview + 3 questions')
  if (!chaptersOK) console.log('   - no chapter rows written')
  process.exit(1)
}
