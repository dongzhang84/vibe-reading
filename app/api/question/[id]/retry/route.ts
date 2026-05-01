import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { matchChapters } from '@/lib/ai/relevance'
import { checkAndIncrement, quotaErrorMessage } from '@/lib/usage/quota'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Re-run the relevance AI for an existing question. Used when the original
 * call returned 0 matches and the user wants to try again — it replaces any
 * cached question_chapters for this question_id.
 */
export async function POST(
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

  // Retry counts against the same daily 'question' bucket — a retry IS
  // an additional gpt-4o-mini call, even if it's against the same question.
  const quota = await checkAndIncrement(user.id, 'question')
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quotaErrorMessage('question', quota.cap) },
      { status: 429 },
    )
  }

  const db = createAdminClient()
  const { data: question } = await db
    .from('questions')
    .select('id, book_id, user_id, text')
    .eq('id', id)
    .single()
  if (!question || question.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: chapters } = await db
    .from('chapters')
    .select('id, seq, title, content, level')
    .eq('book_id', question.book_id)
    .lte('level', 1)
    .order('seq')

  if (!chapters?.length) {
    return NextResponse.json({ matches: 0 })
  }

  let matchCount = 0
  try {
    const matches = await matchChapters({
      question: question.text,
      chapters: chapters.map((c) => ({
        id: c.id,
        seq: c.seq,
        title: c.title,
        firstParagraph: c.content.slice(0, 600),
      })),
    })

    // Replace any prior matches for this question.
    await db.from('question_chapters').delete().eq('question_id', id)

    if (matches.length > 0) {
      const { error: insertError } = await db
        .from('question_chapters')
        .insert(
          matches.map((m, i) => ({
            question_id: id,
            chapter_id: m.chapterId,
            reason: m.reason,
            rank: i + 1,
          })),
        )
      if (insertError) {
        console.error('retry insert failed', insertError)
        return NextResponse.json({ error: 'Save failed' }, { status: 500 })
      }
    }
    matchCount = matches.length
  } catch (err) {
    console.error('retry relevance failed', err)
    return NextResponse.json(
      { error: 'AI retry failed — try again in a moment' },
      { status: 502 },
    )
  }

  return NextResponse.json({ matches: matchCount })
}
