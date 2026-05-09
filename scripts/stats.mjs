#!/usr/bin/env node
// Quick usage snapshot — user count, book count, per-user storage,
// total bucket footprint. Run: node scripts/stats.mjs

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

const { data: books } = await db
  .from('books')
  .select('id, title, owner_id, size_bytes, created_at')
  .order('created_at', { ascending: false })

if (!books) {
  console.log('No books or query error.')
  process.exit(0)
}

const byOwner = new Map()
for (const b of books) {
  if (!b.owner_id) continue
  const cur = byOwner.get(b.owner_id) ?? { count: 0, bytes: 0, latest: null, books: [] }
  cur.count += 1
  cur.bytes += b.size_bytes ?? 0
  cur.books.push(b)
  if (!cur.latest || b.created_at > cur.latest) cur.latest = b.created_at
  byOwner.set(b.owner_id, cur)
}

// Walk Storage to get true total (catches NULL size_bytes from older books).
async function walk(prefix) {
  const out = []
  const { data, error } = await db.storage.from('vr-docs').list(prefix, { limit: 1000 })
  if (error) return out
  for (const item of data ?? []) {
    const isFolder = item.id === null
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (isFolder) out.push(...(await walk(path)))
    else out.push({ path, size: item.metadata?.size ?? 0 })
  }
  return out
}
const files = await walk('')
const totalStorageBytes = files.reduce((s, f) => s + f.size, 0)

const FREE_TIER_BYTES = 1024 * 1024 * 1024 // 1 GB shared with launchradar

console.log('=== USER + BOOK COUNT ===')
console.log(`Total books in DB:       ${books.length}`)
console.log(`Distinct users (owners): ${byOwner.size}`)
const orphaned = books.filter((b) => !b.owner_id).length
if (orphaned > 0) console.log(`Unclaimed (no owner):    ${orphaned}`)

console.log('\n=== STORAGE TOTAL ===')
console.log(`Files in vr-docs:    ${files.length}`)
console.log(`Total in vr-docs:    ${(totalStorageBytes / 1024 / 1024).toFixed(1)} MB`)
console.log(`Supabase Free tier:  1024 MB (shared with launchradar)`)
console.log(`Headroom this app:   ${(FREE_TIER_BYTES / 1024 / 1024 - totalStorageBytes / 1024 / 1024).toFixed(0)} MB (assumes launchradar = 0; subtract its actual footprint)`)

console.log('\n=== PER-USER BREAKDOWN ===')
const sorted = [...byOwner.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
for (const [uid, s] of sorted) {
  const mb = (s.bytes / 1024 / 1024).toFixed(1).padStart(6)
  console.log(`  ${uid.slice(0, 8)}...  ${s.count.toString().padStart(2)} books  ${mb} MB tracked  latest=${s.latest?.slice(0, 16)}`)
}

console.log('\n=== TODAY (last 24h) ===')
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const recent = books.filter((b) => b.created_at > cutoff)
const recentOwners = new Set(recent.map((b) => b.owner_id).filter(Boolean))
console.log(`Books uploaded:   ${recent.length}`)
console.log(`Distinct uploaders: ${recentOwners.size}`)
