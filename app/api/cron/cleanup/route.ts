import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'vr-docs'
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

/**
 * Daily cron (Vercel schedule `0 1 * * *` — see vercel.json). Deletes
 * session books older than 24h that never got claimed (owner_id still
 * null). Cleans up both the Storage PDF and the vr.books row (ON DELETE
 * CASCADE clears chapters / questions / question_chapters / briefs / restatements).
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString()

  const { data: orphans, error } = await db
    .from('books')
    .select('id, storage_path')
    .is('owner_id', null)
    .lt('created_at', cutoff)

  if (error) {
    console.error('cleanup: select orphans failed', error)
    return NextResponse.json({ error: 'Select failed' }, { status: 500 })
  }

  if (!orphans || orphans.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // Remove Storage blobs first (best-effort; DB delete still happens).
  const paths = orphans.map((o) => o.storage_path).filter(Boolean)
  if (paths.length > 0) {
    const { error: removeError } = await db.storage
      .from(STORAGE_BUCKET)
      .remove(paths)
    if (removeError) {
      console.error('cleanup: storage remove failed', removeError)
    }
  }

  const { error: deleteError } = await db
    .from('books')
    .delete()
    .in(
      'id',
      orphans.map((o) => o.id),
    )
  if (deleteError) {
    console.error('cleanup: delete books failed', deleteError)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ deleted: orphans.length })
}
