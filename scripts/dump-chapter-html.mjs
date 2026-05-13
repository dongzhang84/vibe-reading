#!/usr/bin/env node
// One-shot diagnostic: dump the sanitized content_html of a specific
// chapter so we can see what HTML hierarchy the Read pane actually
// receives. Used to plan typography fixes (issue 2).
//
// Usage:
//   node scripts/dump-chapter-html.mjs                  # most recent book, chapter 4 (post-coalesce)
//   node scripts/dump-chapter-html.mjs <book_id> <seq>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'vr' } },
)

let bookId = process.argv[2]
const seq = Number.parseInt(process.argv[3] ?? '4', 10)

if (!bookId) {
  const { data: latest } = await db
    .from('books')
    .select('id, title, format')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  bookId = latest.id
  console.log(`Using most recent book: "${latest.title}" (${latest.format})`)
}

const { data: chapter } = await db
  .from('chapters')
  .select('seq, title, content, content_html')
  .eq('book_id', bookId)
  .eq('seq', seq)
  .single()

if (!chapter) {
  console.error(`No chapter with seq=${seq} for book_id=${bookId}`)
  process.exit(1)
}

console.log(`\n=== Chapter #${chapter.seq}: "${chapter.title}" ===`)
console.log(`content length:      ${chapter.content?.length ?? 0}`)
console.log(`content_html length: ${chapter.content_html?.length ?? 0}`)
console.log()
console.log('--- content_html (first 3000 chars) ---')
console.log(chapter.content_html?.slice(0, 3000) ?? '(null)')
console.log('--- tag census (top 15) ---')
const tags = {}
const re = /<(\/?[a-zA-Z][a-zA-Z0-9]*)\b/g
let m
while ((m = re.exec(chapter.content_html ?? '')) !== null) {
  tags[m[1]] = (tags[m[1]] ?? 0) + 1
}
const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1])
for (const [t, c] of sorted.slice(0, 15)) {
  console.log(`  ${t.padEnd(8)} ${c}`)
}
