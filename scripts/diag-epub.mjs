#!/usr/bin/env node
// One-shot diagnostic: dump format / chapter HTML state for the most
// recent book in vr.books. Used to verify the EPUB pipeline wrote what
// it should have.
//
// Usage:  node scripts/diag-epub.mjs

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

const { data: book, error: be } = await db
  .from('books')
  .select('id, title, format, storage_path, page_count, created_at')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

if (be) {
  console.error('books query error:', be)
  process.exit(1)
}

console.log('Most recent book (replicates q/[questionId] page select):')
console.log('  raw object keys:', Object.keys(book))
console.log('  id:           ', book.id)
console.log('  title:        ', book.title)
console.log('  format value: ', JSON.stringify(book.format))
console.log('  format type:  ', typeof book.format)
console.log('  === "epub"?   ', book.format === 'epub')
console.log()
console.log('  storage_path: ', book.storage_path)
console.log('  page_count:   ', book.page_count)
console.log()

const { data: chapters, error: ce } = await db
  .from('chapters')
  .select('id, seq, title, content, content_html, page_start')
  .eq('book_id', book.id)
  .order('seq')

if (ce) {
  console.error('chapters query error:', ce)
  process.exit(1)
}

const withHtml = chapters.filter((c) => c.content_html && c.content_html.length > 0)
const withoutHtml = chapters.length - withHtml.length
console.log(`Chapters: ${chapters.length} total, ${withHtml.length} with content_html, ${withoutHtml} without`)
console.log()
console.log('First 3 chapters:')
for (const c of chapters.slice(0, 3)) {
  console.log(`  #${c.seq} "${c.title}"`)
  console.log(`    content len:      ${c.content?.length ?? 0}`)
  console.log(`    content_html len: ${c.content_html?.length ?? 0}`)
  if (c.content_html) {
    console.log(`    html sample:      ${c.content_html.slice(0, 120).replace(/\n/g, ' ')}…`)
  }
}
