import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { matchChapters } from '@/lib/ai/relevance'
import { checkAndIncrement, quotaErrorMessage } from '@/lib/usage/quota'

export const runtime = 'nodejs'
export const maxDuration = 60

const MIN_QUESTION_CHARS = 3

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.bookId !== 'string' ||
    typeof body.text !== 'string'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const text = body.text.trim()
  if (text.length < MIN_QUESTION_CHARS) {
    return NextResponse.json(
      { error: 'Question is too short' },
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

  const quota = await checkAndIncrement(user.id, 'question')
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quotaErrorMessage('question', quota.cap) },
      { status: 429 },
    )
  }

  const db = createAdminClient()

  const { data: book } = await db
    .from('books')
    .select('id, owner_id')
    .eq('id', body.bookId)
    .single()
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: question, error: qError } = await db
    .from('questions')
    .insert({
      book_id: body.bookId,
      user_id: user.id,
      text,
    })
    .select('id')
    .single()
  if (qError || !question) {
    console.error('question insert failed', qError)
    return NextResponse.json(
      { error: 'Failed to save question' },
      { status: 500 },
    )
  }

  // Relevance AI: synchronous (~3s). Failure is non-fatal — Question Result
  // page handles empty matches list with a "AI mapping unavailable" hint.
  try {
    const { data: chapters } = await db
      .from('chapters')
      .select('id, seq, title, content, level')
      .eq('book_id', body.bookId)
      .lte('level', 1)
      .order('seq')

    if (chapters && chapters.length > 0) {
      const matches = await matchChapters({
        question: text,
        chapters: chapters.map((c) => ({
          id: c.id,
          seq: c.seq,
          title: c.title,
          firstParagraph: c.content.slice(0, 600),
        })),
      })

      if (matches.length > 0) {
        const { error: matchInsertError } = await db
          .from('question_chapters')
          .insert(
            matches.map((m, i) => ({
              question_id: question.id,
              chapter_id: m.chapterId,
              reason: m.reason,
              rank: i + 1,
            })),
          )
        if (matchInsertError) {
          // Don't swallow — earlier silent failure (FK violation from
          // hallucinated chapter_ids) made bugs invisible. We still
          // return 200 to the user since the question itself is saved.
          console.error('question_chapters insert failed', matchInsertError)
        }
      } else {
        console.warn('relevance returned 0 matches for question', question.id)
      }
    }
  } catch (err) {
    console.error('relevance AI failed (non-fatal)', err)
  }

  return NextResponse.json({ questionId: question.id })
}
