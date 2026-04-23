import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

const STORAGE_BUCKET = 'vr-docs'

/**
 * Move session books → a real user and relocate their Storage blobs.
 *
 * Called from:
 * - POST /api/claim (explicit, from the client)
 * - /auth/callback (inline, right after exchangeCodeForSession — so the
 *   next page the user lands on already has ownership)
 *
 * Idempotent: will only claim books that are session-bound and unowned.
 * Storage moves are best-effort; failures are logged and the book row stays
 * pointed at whatever path is in DB, so cron cleanup can still find orphans.
 */
export async function claimSessionBooks({
  userId,
  sessionId,
}: {
  userId: string
  sessionId: string
}): Promise<{ claimed: number }> {
  const db = createAdminClient()

  const { data: claimed, error } = await db
    .from('books')
    .update({ owner_id: userId, session_id: null })
    .eq('session_id', sessionId)
    .is('owner_id', null)
    .select('id, storage_path')

  if (error) {
    console.error('claim update failed', error)
    return { claimed: 0 }
  }

  for (const book of claimed ?? []) {
    const newPath = book.storage_path.replace(
      /^session\/[^/]+\//,
      `user/${userId}/`,
    )
    if (newPath === book.storage_path) continue
    const { error: moveError } = await db.storage
      .from(STORAGE_BUCKET)
      .move(book.storage_path, newPath)
    if (moveError) {
      console.error('storage move failed', book.id, moveError)
      continue
    }
    await db.from('books').update({ storage_path: newPath }).eq('id', book.id)
  }

  return { claimed: claimed?.length ?? 0 }
}
