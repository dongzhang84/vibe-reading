#!/usr/bin/env node
// One-shot: find Storage files in vr-docs that have no corresponding
// books row, optionally remove them.
//
// Usage:
//   node scripts/cleanup-orphan-pdfs.mjs            # dry run, lists only
//   node scripts/cleanup-orphan-pdfs.mjs --commit   # actually delete

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const COMMIT = process.argv.includes('--commit')

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
    if (isFolder) out.push(...(await walk(path)))
    else out.push({ path, size: item.metadata?.size ?? 0 })
  }
  return out
}

const files = await walk('')
const { data: books } = await db
  .from('books')
  .select('id, storage_path')

const referenced = new Set(
  (books ?? [])
    .map((b) => b.storage_path)
    .filter((p) => typeof p === 'string'),
)

const orphans = files.filter((f) => !referenced.has(f.path))
const totalOrphanBytes = orphans.reduce((s, f) => s + f.size, 0)

console.log(
  `Storage: ${files.length} files. books rows: ${books?.length ?? 0}.`,
)
console.log(
  `Orphans: ${orphans.length} (${(totalOrphanBytes / 1024 / 1024).toFixed(2)} MB)\n`,
)

if (orphans.length === 0) {
  console.log('Nothing to clean up.')
  process.exit(0)
}

for (const f of orphans) {
  console.log(`  ${(f.size / 1024 / 1024).toFixed(2).padStart(7)} MB  ${f.path}`)
}

if (!COMMIT) {
  console.log('\n[dry run] Re-run with --commit to actually delete.')
  process.exit(0)
}

console.log('\n[commit] removing orphans...')
const { error } = await db.storage
  .from('vr-docs')
  .remove(orphans.map((o) => o.path))
if (error) {
  console.error('remove failed', error)
  process.exit(1)
}
console.log(`Removed ${orphans.length} orphan files.`)
