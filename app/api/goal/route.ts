import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'

const MIN_CHARS = 10

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.bookId !== 'string' || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const bookId: string = body.bookId
  const text = body.text.trim()
  if (text.length < MIN_CHARS) {
    return NextResponse.json(
      { error: `Goal must be at least ${MIN_CHARS} characters` },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const { data: book, error: bookError } = await db
    .from('books')
    .select('id, session_id, owner_id')
    .eq('id', bookId)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const sessionId = await getSessionId()

  const authorized =
    (user && book.owner_id === user.id) ||
    (sessionId && book.session_id === sessionId)

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: upsertError } = await db
    .from('goals')
    .upsert({ book_id: bookId, text }, { onConflict: 'book_id' })

  if (upsertError) {
    console.error('goals upsert failed', upsertError)
    return NextResponse.json({ error: 'Could not save goal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
