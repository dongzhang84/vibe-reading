import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type QuotaAction = 'question' | 'brief' | 'ask' | 'upload'

/**
 * Per-user daily caps. Sized so a real reader doing real work never hits
 * them — the goal is to stop curl loops and runaway-cost incidents, not to
 * throttle legitimate use. Tune by watching real usage once we have any.
 */
const DAILY_CAPS: Record<QuotaAction, number> = {
  question: 50,
  brief: 100,
  ask: 200,
  upload: 5,
}

export interface QuotaResult {
  allowed: boolean
  cap: number
  used: number
  /** Unix seconds at which the count resets (next UTC midnight). */
  resetAtUnixSec: number
}

/**
 * Atomically check + increment a per-user daily quota for an AI-spend
 * action. Backed by `vr.bump_usage` (scripts/migrate-v2.2-rate-limit.sql)
 * which holds a `for update` row lock so two concurrent requests can't
 * both pass the cap check.
 *
 * Fail-open on infra errors: if the RPC throws or returns garbage we let
 * the call through and log loudly. The OpenAI cost-ceiling on the API key
 * is the belt; this is the suspenders.
 */
export async function checkAndIncrement(
  userId: string,
  action: QuotaAction,
): Promise<QuotaResult> {
  const cap = DAILY_CAPS[action]
  const db = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc('bump_usage', {
    p_user_id: userId,
    p_action: action,
    p_cap: cap,
  })

  if (error) {
    console.error('[quota] bump_usage RPC failed (allowing request)', {
      userId,
      action,
      error,
    })
    return { allowed: true, cap, used: 0, resetAtUnixSec: midnightUtcSec() }
  }

  const rows = data as
    | Array<{ allowed: boolean; used: number; cap: number }>
    | null
  const row = rows?.[0]
  if (!row) {
    console.error('[quota] bump_usage returned empty rows (allowing)', {
      userId,
      action,
    })
    return { allowed: true, cap, used: 0, resetAtUnixSec: midnightUtcSec() }
  }

  return {
    allowed: row.allowed,
    cap: row.cap,
    used: row.used,
    resetAtUnixSec: midnightUtcSec(),
  }
}

/** Friendly error message for the rate-limit 429 response body. */
export function quotaErrorMessage(action: QuotaAction, cap: number): string {
  const noun: Record<QuotaAction, string> = {
    question: 'questions',
    brief: 'briefs',
    ask: 'highlight asks',
    upload: 'book uploads',
  }
  return `Daily ${noun[action]} limit reached (${cap}/day). Try again after midnight UTC.`
}

// ─────────────────────────────────────────────────────────────────────────
// Storage quota — separate from the daily-action quota above. Keyed on
// total bytes + total book count per user, sized for the Supabase Free
// plan's 1 GB shared bucket.
// ─────────────────────────────────────────────────────────────────────────

export const STORAGE_BYTES_CAP_PER_USER = 100 * 1024 * 1024 // 100 MB
export const BOOK_COUNT_CAP_PER_USER = 15

export interface StorageQuotaResult {
  allowed: boolean
  reason?: 'bytes' | 'count'
  /** Bytes already used by this user's owned books. */
  usedBytes: number
  /** Books already owned by this user. */
  usedBooks: number
  bytesCap: number
  bookCap: number
}

/**
 * Check whether `incomingBytes` would push this user over either of:
 *   - total Storage bytes cap (sum of `books.size_bytes`)
 *   - total book count cap
 *
 * Pre-quota books with `size_bytes = NULL` count as 0 — acceptable
 * undercount for the few rows that pre-date the v2.3 migration.
 */
export async function checkStorageQuota(
  userId: string,
  incomingBytes: number,
): Promise<StorageQuotaResult> {
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = (await (db as any)
    .from('books')
    .select('size_bytes')
    .eq('owner_id', userId)) as {
    data: Array<{ size_bytes: number | null }> | null
  }

  const owned = rows ?? []
  const usedBytes = owned.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0)
  const usedBooks = owned.length

  if (usedBooks >= BOOK_COUNT_CAP_PER_USER) {
    return {
      allowed: false,
      reason: 'count',
      usedBytes,
      usedBooks,
      bytesCap: STORAGE_BYTES_CAP_PER_USER,
      bookCap: BOOK_COUNT_CAP_PER_USER,
    }
  }
  if (usedBytes + incomingBytes > STORAGE_BYTES_CAP_PER_USER) {
    return {
      allowed: false,
      reason: 'bytes',
      usedBytes,
      usedBooks,
      bytesCap: STORAGE_BYTES_CAP_PER_USER,
      bookCap: BOOK_COUNT_CAP_PER_USER,
    }
  }
  return {
    allowed: true,
    usedBytes,
    usedBooks,
    bytesCap: STORAGE_BYTES_CAP_PER_USER,
    bookCap: BOOK_COUNT_CAP_PER_USER,
  }
}

export function storageQuotaErrorMessage(r: StorageQuotaResult): string {
  if (r.reason === 'count') {
    return `Library limit reached (${r.usedBooks}/${r.bookCap} books). Delete a book in /library to free a slot.`
  }
  // bytes
  const usedMB = (r.usedBytes / (1024 * 1024)).toFixed(1)
  const capMB = Math.round(r.bytesCap / (1024 * 1024))
  return `Storage full (${usedMB} MB used of ${capMB} MB). Delete an old book in /library to free space.`
}

function midnightUtcSec(): number {
  const t = new Date()
  t.setUTCHours(24, 0, 0, 0)
  return Math.floor(t.getTime() / 1000)
}
