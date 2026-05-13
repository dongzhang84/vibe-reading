#!/usr/bin/env node
// One-shot: look up the test user's id, clear today's usage_counters
// rows for them, and print the user_id to add to QUOTA_EXEMPT_USER_IDS
// in .env.local for durable exemption.
//
// Usage:  node scripts/exempt-test-user.mjs <email>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const email = process.argv[2]
if (!email) {
  console.error('usage: node scripts/exempt-test-user.mjs <email>')
  process.exit(1)
}

// auth admin client (no schema override — auth lives in `auth` schema,
// which is exposed via the GoTrue admin API rather than PostgREST).
const auth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Page through users until we find a match (admin.listUsers paginates).
async function findUserId(target) {
  let page = 1
  while (true) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) return null
    page += 1
  }
}

const userId = await findUserId(email)
if (!userId) {
  console.error(`no auth user found for email "${email}"`)
  process.exit(1)
}
console.log(`Found user_id for ${email}:`)
console.log('  ' + userId)
console.log()

// Now clear today's usage_counters rows under vr schema.
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'vr' } },
)

const today = new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD

const { data: before } = await db
  .from('usage_counters')
  .select('action, used, day')
  .eq('user_id', userId)
  .eq('day', today)

console.log(`Today's usage_counters rows for ${email} (UTC ${today}):`)
for (const r of before ?? []) {
  console.log(`  ${r.action}: ${r.used}`)
}
if ((before ?? []).length === 0) {
  console.log('  (none — counter already clear)')
}

const { error: delErr } = await db
  .from('usage_counters')
  .delete()
  .eq('user_id', userId)
  .eq('day', today)
if (delErr) {
  console.error('failed to clear:', delErr)
  process.exit(1)
}
console.log()
console.log("Cleared. The user can now upload again today.")
console.log()
console.log('For durable exemption (no future limits), add to .env.local:')
console.log(`  QUOTA_EXEMPT_USER_IDS=${userId}`)
console.log('Then restart dev: Ctrl+C and `npm run dev`.')
