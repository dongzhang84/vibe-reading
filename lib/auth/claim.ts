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
    // Critical: if this update fails AFTER the file has already been moved,
    // books.storage_path keeps the stale `session/...` value while the
    // physical file is at `user/...`. Future deletes would call
    // storage.remove() on the stale path (silent no-op for nonexistent
    // files) and orphan the file forever. Detect → roll the move back so
    // DB and Storage stay in sync.
    const { error: updateError } = await db
      .from('books')
      .update({ storage_path: newPath })
      .eq('id', book.id)
    if (updateError) {
      console.error(
        'claim: storage_path update failed AFTER move; rolling move back',
        book.id,
        updateError,
      )
      const { error: rollbackError } = await db.storage
        .from(STORAGE_BUCKET)
        .move(newPath, book.storage_path)
      if (rollbackError) {
        console.error(
          'claim: rollback move ALSO failed — orphan possible',
          book.id,
          rollbackError,
        )
      }
    }
  }

  return { claimed: claimed?.length ?? 0 }
}
