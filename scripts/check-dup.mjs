import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = readFileSync('/Users/dong/Projects/vibe-reading/.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'vr' } },
)
const { data } = await db
  .from('books')
  .select('id, title, author, page_count, storage_path, session_id, owner_id, created_at, size_bytes')
  .ilike('title', '%AI Engineering%')
  .order('created_at')
for (const b of data ?? []) {
  console.log(`\nid=${b.id}`)
  console.log(`  title=${b.title}`)
  console.log(`  author=${b.author}`)
  console.log(`  pages=${b.page_count}, size=${b.size_bytes ?? 'NULL'}`)
  console.log(`  created_at=${b.created_at}`)
  console.log(`  owner_id=${b.owner_id}`)
  console.log(`  session_id=${b.session_id}`)
  console.log(`  storage_path=${b.storage_path}`)
}

// Also check questions on each
for (const b of data ?? []) {
  const { data: qs } = await db
    .from('questions')
    .select('id, text, created_at')
    .eq('book_id', b.id)
    .order('created_at')
  console.log(`\nquestions for ${b.id}: ${qs?.length ?? 0}`)
  for (const q of qs ?? []) {
    console.log(`  ${q.created_at}  ${q.text.slice(0, 60)}`)
  }
}
