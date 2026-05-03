#!/usr/bin/env node
// One-shot: list every PDF under vr-docs and the books row that owns it.
// Run: node scripts/list-storage.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// load .env.local
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

async function walk(prefix) {
  const out = []
  const { data, error } = await db.storage.from('vr-docs').list(prefix, {
    limit: 1000,
  })
  if (error) {
    console.error('list error', prefix, error)
    return out
  }
  for (const item of data ?? []) {
    const isFolder = item.id === null
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (isFolder) {
      out.push(...(await walk(path)))
    } else {
      out.push({ path, size: item.metadata?.size ?? 0 })
    }
  }
  return out
}

const files = await walk('')
console.log(`Found ${files.length} files in vr-docs:\n`)
for (const f of files) {
  console.log(`  ${(f.size / 1024 / 1024).toFixed(2).padStart(7)} MB  ${f.path}`)
}
const total = files.reduce((s, f) => s + f.size, 0)
console.log(`\nTotal: ${(total / 1024 / 1024).toFixed(2)} MB across ${files.length} files`)

console.log('\n=== books rows ===\n')
const { data: books } = await db
  .from('books')
  .select('id, title, owner_id, session_id, storage_path, size_bytes, created_at')
  .order('created_at', { ascending: false })

for (const b of books ?? []) {
  const sizeMB = b.size_bytes ? (b.size_bytes / 1024 / 1024).toFixed(2) : '?'
  const owner = b.owner_id ? `owner=${b.owner_id.slice(0, 8)}...` : `session=${b.session_id?.slice(0, 8)}...`
  console.log(`  [${b.id.slice(0, 8)}] ${b.title.slice(0, 50).padEnd(50)} ${sizeMB} MB  ${owner}`)
  console.log(`             path: ${b.storage_path}`)
}
