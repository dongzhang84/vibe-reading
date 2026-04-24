import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRestate, type CheckResult } from '@/lib/ai/checker'

export const runtime = 'nodejs'
export const maxDuration = 60

const MIN_CHARS = 30

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.bookId !== 'string' ||
    typeof body.chapterId !== 'string' ||
    typeof body.text !== 'string'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { bookId, chapterId } = body as { bookId: string; chapterId: string }
  const text = body.text.trim()
  if (text.length < MIN_CHARS) {
    return NextResponse.json(
      { error: `Restatement must be at least ${MIN_CHARS} characters` },
      { status: 400 },
    )
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
    .select('id, owner_id')
    .eq('id', bookId)
    .single()
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: chapter } = await db
    .from('chapters')
    .select('id, content, book_id')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  let result: CheckResult
  try {
    result = await checkRestate(chapter.content, text)
  } catch (err) {
    console.error('checkRestate failed', err)
    return NextResponse.json(
      { error: 'AI check failed — try again in a moment' },
      { status: 502 },
    )
  }

  // Schema note: vr.restatements still has the old got_right/missed jsonb
  // columns from the v1 ✓/✗ design (NOT NULL). We intentionally don't
  // migrate yet (zero rows, would just churn user). Pack the new "angles"
  // paragraph into missed[0] for storage; got_right is always [] going
  // forward. Next time we touch the schema, drop got_right and rename
  // missed → ai_response.
  const { error: insertError } = await db.from('restatements').insert({
    chapter_id: chapterId,
    user_id: user.id,
    text,
    got_right: [],
    missed: result.angles ? [result.angles] : [],
    follow_up: result.follow_up ? result.follow_up : null,
  })
  if (insertError) {
    console.error('restatements insert failed', insertError)
    // Still return the AI result — UI matters more than the log.
  }

  return NextResponse.json({ result })
}
