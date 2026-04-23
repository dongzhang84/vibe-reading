import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'

const STORAGE_BUCKET = 'vr-docs'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionId = await getSessionId()
  if (!sessionId) {
    return NextResponse.json({ claimed: 0 })
  }

  const db = createAdminClient()

  // Move session books to this user. Only books that are genuinely unclaimed
  // (owner_id is null) and bound to this session — don't steal someone else's.
  const { data: claimed, error } = await db
    .from('books')
    .update({ owner_id: user.id, session_id: null })
    .eq('session_id', sessionId)
    .is('owner_id', null)
    .select('id, storage_path')

  if (error) {
    console.error('claim update failed', error)
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 })
  }

  // Move Storage blobs session/<sid>/… → user/<uid>/…. Best-effort:
  // if any single move fails, keep the book row pointing at whatever path
  // the DB now holds; cron cleanup will catch true orphans.
  for (const book of claimed ?? []) {
    const newPath = book.storage_path.replace(
      /^session\/[^/]+\//,
      `user/${user.id}/`,
    )
    if (newPath === book.storage_path) continue // nothing to move

    const { error: moveError } = await db.storage
      .from(STORAGE_BUCKET)
      .move(book.storage_path, newPath)
    if (moveError) {
      console.error('storage move failed', book.id, moveError)
      continue
    }
    await db.from('books').update({ storage_path: newPath }).eq('id', book.id)
  }

  return NextResponse.json({ claimed: claimed?.length ?? 0 })
}
