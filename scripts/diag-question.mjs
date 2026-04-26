// Quick diagnostic: inspect a book + question's DB state to figure out
// why question_chapters is empty.
//
// Usage: node scripts/diag-question.mjs <bookId> <questionId>

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

const [bookId, questionId] = process.argv.slice(2)
if (!bookId || !questionId) {
  console.error('Usage: node scripts/diag-question.mjs <bookId> <questionId>')
  process.exit(1)
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'vr' } },
)

console.log('\n┌─ BOOK ──────────────────────────────────────────────────')
const { data: book } = await sb
  .from('books')
  .select('id, owner_id, title, page_count, toc, suggested_questions')
  .eq('id', bookId)
  .single()
if (!book) {
  console.log('│ NOT FOUND')
  process.exit(1)
}
console.log(`│ id:         ${book.id}`)
console.log(`│ owner_id:   ${book.owner_id}`)
console.log(`│ title:      ${book.title}`)
console.log(`│ pages:      ${book.page_count}`)
console.log(`│ toc:        ${book.toc ? `${book.toc.length} entries` : '(null — fallback)'}`)
console.log(`│ suggested:  ${book.suggested_questions?.length ?? 0} qs`)

console.log('\n┌─ CHAPTERS ──────────────────────────────────────────────')
const { data: chapters } = await sb
  .from('chapters')
  .select('id, seq, title, level, page_start, page_end, content')
  .eq('book_id', bookId)
  .order('seq')
console.log(`│ total: ${chapters?.length ?? 0}`)
for (const c of chapters ?? []) {
  console.log(`│  ${c.seq}. lv${c.level} ${c.page_start ?? '-'}–${c.page_end ?? '-'} "${c.title}" (${c.content.length}c)`)
}
const top = (chapters ?? []).filter((c) => c.level <= 1)
console.log(`│ top-level (level<=1, sent to relevance AI): ${top.length}`)

console.log('\n┌─ QUESTION ──────────────────────────────────────────────')
const { data: q } = await sb
  .from('questions')
  .select('id, book_id, user_id, text, created_at')
  .eq('id', questionId)
  .single()
if (!q) {
  console.log('│ NOT FOUND')
  process.exit(1)
}
console.log(`│ id:      ${q.id}`)
console.log(`│ book_id: ${q.book_id} ${q.book_id === bookId ? '✓' : '✗ MISMATCH'}`)
console.log(`│ user_id: ${q.user_id}`)
console.log(`│ text:    ${q.text}`)

console.log('\n┌─ QUESTION_CHAPTERS ─────────────────────────────────────')
const { data: matches } = await sb
  .from('question_chapters')
  .select('id, chapter_id, reason, rank')
  .eq('question_id', questionId)
  .order('rank')
console.log(`│ total: ${matches?.length ?? 0}`)
for (const m of matches ?? []) {
  console.log(`│  rank=${m.rank} chapter_id=${m.chapter_id ?? '(null = book-level)'}`)
  console.log(`│    "${m.reason}"`)
}
console.log()
