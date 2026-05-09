#!/usr/bin/env node
// List Vibe Reading users with first name (from Auth metadata, if any),
// email, and whether they've uploaded a book yet.
// Run: node scripts/list-users.mjs

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

// 1) Get all users from Auth (paginated; we won't have thousands yet so 1k is fine).
const { data: usersPage, error: authErr } = await db.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})
if (authErr) {
  console.error('listUsers failed', authErr)
  process.exit(1)
}
const users = usersPage.users

// 2) Get books grouped by owner (count + latest title).
const { data: books } = await db
  .from('books')
  .select('owner_id, title, created_at')
  .order('created_at', { ascending: false })

const booksByOwner = new Map()
for (const b of books ?? []) {
  if (!b.owner_id) continue
  const cur = booksByOwner.get(b.owner_id) ?? { count: 0, latest: null }
  cur.count += 1
  if (!cur.latest) cur.latest = b
  booksByOwner.set(b.owner_id, cur)
}

// 3) Heuristic first-name extraction from Auth metadata.
function pickFirstName(u) {
  const m = u.user_metadata || {}
  const candidates = [
    m.given_name,
    m.first_name,
    typeof m.full_name === 'string' ? m.full_name.split(' ')[0] : null,
    typeof m.name === 'string' ? m.name.split(' ')[0] : null,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return ''
}

// 4) Build rows (sort: uploaded users first, then recent signups).
const rows = users
  .map((u) => {
    const b = booksByOwner.get(u.id)
    return {
      created_at: u.created_at,
      first_name: pickFirstName(u),
      email: u.email ?? '(no email)',
      uploaded: b ? b.count : 0,
      latest_title: b?.latest?.title ?? '',
    }
  })
  .sort((a, b) => {
    if (a.uploaded !== b.uploaded) return b.uploaded - a.uploaded
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })

// 5) Print table.
const COLS = [
  ['signed up',  16, (r) => (r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : '')],
  ['first',      12, (r) => r.first_name.slice(0, 12)],
  ['email',      40, (r) => r.email.slice(0, 40)],
  ['books',       6, (r) => r.uploaded.toString()],
  ['latest book', 50, (r) => r.latest_title.slice(0, 50)],
]
const sep = '─'.repeat(COLS.reduce((s, c) => s + c[1] + 2, 1))
const header = COLS.map(([h, w]) => h.padEnd(w)).join('  ')

console.log(`\nTotal users in Auth: ${users.length}`)
console.log(`Users who've uploaded ≥ 1 book: ${rows.filter((r) => r.uploaded > 0).length}`)
console.log(`Users who've signed up but never uploaded: ${rows.filter((r) => r.uploaded === 0).length}\n`)
console.log(sep)
console.log(header)
console.log(sep)
for (const r of rows) {
  console.log(COLS.map(([, w, f]) => f(r).padEnd(w)).join('  '))
}
console.log(sep)
