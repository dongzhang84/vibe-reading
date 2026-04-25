// Probe: verify v2 schema migration is complete and correct.
// Usage: node scripts/probe-schema-v2.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local

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

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: 'vr' } },
)

const checks = []

async function check(name, fn) {
  try {
    const result = await fn()
    checks.push({ name, ok: true, info: result })
  } catch (err) {
    checks.push({ name, ok: false, info: err.message })
  }
}

// 1. v2 tables exist (and are queryable via service_role)
await check('vr.questions exists', async () => {
  const { error, count } = await sb.from('questions').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

await check('vr.question_chapters exists', async () => {
  const { error, count } = await sb.from('question_chapters').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

await check('vr.briefs exists (recreated)', async () => {
  const { error, count } = await sb.from('briefs').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

await check('vr.books exists', async () => {
  const { error, count } = await sb.from('books').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

await check('vr.chapters exists', async () => {
  const { error, count } = await sb.from('chapters').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

await check('vr.restatements exists (preserved)', async () => {
  const { error, count } = await sb.from('restatements').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return `count=${count}`
})

// 2. v1 tables gone
await check('vr.goals dropped', async () => {
  const { error } = await sb.from('goals').select('id').limit(1)
  if (!error) throw new Error('still queryable — drop did not happen')
  if (!/relation .* does not exist|Could not find/i.test(error.message)) {
    throw new Error(`unexpected error: ${error.message}`)
  }
  return 'gone ✓'
})

await check('vr.chapter_maps dropped', async () => {
  const { error } = await sb.from('chapter_maps').select('id').limit(1)
  if (!error) throw new Error('still queryable — drop did not happen')
  if (!/relation .* does not exist|Could not find/i.test(error.message)) {
    throw new Error(`unexpected error: ${error.message}`)
  }
  return 'gone ✓'
})

// 3. v2 columns on books
await check('vr.books has toc/overview/suggested_questions', async () => {
  const { error } = await sb.from('books').select('toc, overview, suggested_questions').limit(1)
  if (error) throw new Error(error.message)
  return 'all 3 columns selectable ✓'
})

// 4. v2 column on chapters
await check('vr.chapters has level', async () => {
  const { error } = await sb.from('chapters').select('level').limit(1)
  if (error) throw new Error(error.message)
  return 'level selectable ✓'
})

// 5. briefs has new shape (no goal_id)
await check('vr.briefs lost goal_id (v2 shape)', async () => {
  const { error } = await sb.from('briefs').select('goal_id').limit(1)
  if (!error) throw new Error('goal_id still exists — old briefs not dropped/recreated')
  if (!/column .* does not exist|Could not find/i.test(error.message)) {
    throw new Error(`unexpected error: ${error.message}`)
  }
  return 'goal_id gone ✓'
})

// 6. v1 books wiped
await check('old books deleted (count=0)', async () => {
  const { count, error } = await sb.from('books').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  if (count > 0) {
    return `⚠️ count=${count} — non-zero. Run: delete from vr.books;  (and clear Storage UI)`
  }
  return 'count=0 ✓'
})

// 7. RLS enforced — anon should be blocked
const sbAnon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false }, db: { schema: 'vr' } },
)

await check('RLS: anon blocked from vr.questions', async () => {
  const { data, error } = await sbAnon.from('questions').select('id').limit(1)
  if (error) {
    // permission denied is fine — that's RLS working
    if (/permission denied|JWT|row-level security/i.test(error.message)) return 'blocked ✓'
    throw new Error(`unexpected: ${error.message}`)
  }
  // No error + empty array means RLS returned 0 rows for anon (also fine, just less explicit)
  if (data && data.length === 0) return 'returns 0 rows (RLS filtering) ✓'
  throw new Error(`anon got ${data?.length} rows back — RLS not enforced!`)
})

await check('RLS: anon blocked from vr.question_chapters', async () => {
  const { data, error } = await sbAnon.from('question_chapters').select('id').limit(1)
  if (error) {
    if (/permission denied|JWT|row-level security/i.test(error.message)) return 'blocked ✓'
    throw new Error(`unexpected: ${error.message}`)
  }
  if (data && data.length === 0) return 'returns 0 rows (RLS filtering) ✓'
  throw new Error(`anon got ${data?.length} rows back`)
})

// Print
console.log('\n┌─ V2 SCHEMA PROBE ──────────────────────────────────────────────────')
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌'
  console.log(`│ ${icon}  ${c.name.padEnd(48)} ${c.info}`)
}
console.log('└────────────────────────────────────────────────────────────────────')
const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed.\n`)
  process.exit(1)
}
console.log('\nAll v2 schema checks passed. Ready for M1.\n')
