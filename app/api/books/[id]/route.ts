import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'vr-docs'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: book } = await db
    .from('books')
    .select('id, owner_id, storage_path')
    .eq('id', id)
    .single()
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Best-effort blob removal first. The row delete cascades chapters /
  // questions / question_chapters / briefs / restatements via FK.
  if (book.storage_path) {
    const { error: storageError } = await db.storage
      .from(STORAGE_BUCKET)
      .remove([book.storage_path])
    if (storageError) {
      console.error('storage remove failed (non-fatal)', storageError)
    }
  }

  const { error } = await db.from('books').delete().eq('id', id)
  if (error) {
    console.error('book delete failed', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
