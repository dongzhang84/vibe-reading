#!/usr/bin/env node
// List every Storage bucket in the shared Supabase project, with total size.
// Run: node scripts/list-all-buckets.mjs

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
)

async function walk(bucket, prefix) {
  const out = []
  const { data, error } = await db.storage
    .from(bucket)
    .list(prefix, { limit: 1000 })
  if (error) return out
  for (const item of data ?? []) {
    const isFolder = item.id === null
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (isFolder) out.push(...(await walk(bucket, path)))
    else out.push({ size: item.metadata?.size ?? 0 })
  }
  return out
}

const { data: buckets, error } = await db.storage.listBuckets()
if (error) {
  console.error('listBuckets failed', error)
  process.exit(1)
}

console.log(`Found ${buckets.length} bucket(s) in this Supabase project:\n`)

let grandTotal = 0
for (const b of buckets) {
  const files = await walk(b.name, '')
  const total = files.reduce((s, f) => s + f.size, 0)
  grandTotal += total
  const mb = (total / 1024 / 1024).toFixed(1)
  console.log(`  ${b.name.padEnd(20)}  ${files.length.toString().padStart(4)} files  ${mb.padStart(7)} MB`)
}

const FREE_TIER_MB = 1024
const usedMB = (grandTotal / 1024 / 1024).toFixed(1)
const freeMB = (FREE_TIER_MB - grandTotal / 1024 / 1024).toFixed(1)
console.log(`\n  ${'TOTAL'.padEnd(20)}  ${'    '}      ${usedMB.padStart(7)} MB`)
console.log(`\nSupabase Free tier: ${FREE_TIER_MB} MB. Headroom: ${freeMB} MB.`)
