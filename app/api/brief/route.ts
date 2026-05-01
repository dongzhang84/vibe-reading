import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { briefChapter, type Brief } from '@/lib/ai/briefer'
import { checkAndIncrement, quotaErrorMessage } from '@/lib/usage/quota'
import type { Json } from '@/types/db'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.bookId !== 'string' ||
    typeof body.chapterId !== 'string'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { bookId, chapterId } = body as { bookId: string; chapterId: string }

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
    .select('id, book_id, title, content')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  // Rule 1: a question must exist for this book before any chapter content
  // is generated. This is the technical enforcement of "user expressed need
  // before content gets compressed."
  const { count: questionCount } = await db
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId)
    .eq('user_id', user.id)
  if (!questionCount || questionCount < 1) {
    return NextResponse.json(
      { error: 'Ask a question first' },
      { status: 403 },
    )
  }

  // Cache lookup (chapter_id-based; v2 dropped goal_id)
  const { data: cached } = await db
    .from('briefs')
    .select('one_sentence, key_claims, example, not_addressed')
    .eq('chapter_id', chapterId)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      brief: {
        one_sentence: cached.one_sentence,
        key_claims: cached.key_claims as string[],
        example: cached.example,
        not_addressed: cached.not_addressed,
      } satisfies Brief,
    })
  }

  // Cache miss — actual gpt-4o-mini call follows. Quota check belongs HERE,
  // not above the cache lookup, so re-reading an old brief never burns quota.
  const quota = await checkAndIncrement(user.id, 'brief')
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quotaErrorMessage('brief', quota.cap) },
      { status: 429 },
    )
  }

  let brief: Brief
  try {
    brief = await briefChapter(chapter.title, chapter.content)
  } catch (err) {
    console.error('briefChapter failed', err)
    return NextResponse.json(
      { error: 'AI brief failed — try again in a moment' },
      { status: 502 },
    )
  }

  const { error: insertError } = await db.from('briefs').insert({
    chapter_id: chapterId,
    one_sentence: brief.one_sentence,
    key_claims: brief.key_claims as unknown as Json,
    example: brief.example,
    not_addressed: brief.not_addressed,
  })
  if (insertError) {
    console.error('brief cache write failed (non-fatal)', insertError)
  }

  return NextResponse.json({ brief })
}
