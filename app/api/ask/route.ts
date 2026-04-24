import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { askAboutSelection } from '@/lib/ai/asker'

export const runtime = 'nodejs'
export const maxDuration = 30

const MIN_SELECTION = 15
const MAX_SELECTION = 2000

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.bookId !== 'string' ||
    typeof body.chapterId !== 'string' ||
    typeof body.selection !== 'string'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { bookId, chapterId } = body as {
    bookId: string
    chapterId: string
  }
  const selection: string = body.selection.trim()
  const question =
    typeof body.question === 'string' ? body.question.trim() : undefined

  if (selection.length < MIN_SELECTION) {
    return NextResponse.json(
      { error: `Select at least ${MIN_SELECTION} characters` },
      { status: 400 },
    )
  }
  if (selection.length > MAX_SELECTION) {
    return NextResponse.json(
      { error: 'Selection too long — try highlighting a smaller passage' },
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

  // Rule 1: goal must exist.
  const { data: goal } = await db
    .from('goals')
    .select('text')
    .eq('book_id', bookId)
    .maybeSingle()
  if (!goal) {
    return NextResponse.json({ error: 'No goal set' }, { status: 403 })
  }

  const { data: chapter } = await db
    .from('chapters')
    .select('title, content, book_id')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  try {
    const result = await askAboutSelection({
      goal: goal.text,
      chapterTitle: chapter.title,
      chapterContent: chapter.content,
      selection,
      question,
    })
    if (!result.answer) {
      return NextResponse.json(
        { error: 'Model returned no answer' },
        { status: 502 },
      )
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('askAboutSelection failed', err)
    return NextResponse.json(
      { error: 'AI ask failed — try again in a moment' },
      { status: 502 },
    )
  }
}
