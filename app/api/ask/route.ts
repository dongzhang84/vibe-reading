import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { askPassage } from '@/lib/ai/asker'

export const runtime = 'nodejs'
export const maxDuration = 60

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
  const { bookId, chapterId } = body
  const selection = body.selection.trim()
  if (selection.length < MIN_SELECTION || selection.length > MAX_SELECTION) {
    return NextResponse.json(
      { error: `Selection must be ${MIN_SELECTION}-${MAX_SELECTION} chars` },
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
    .select('id, book_id, title, content')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  // Rule 1: a question must exist before any chapter content is generated.
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

  let answer: string
  try {
    answer = await askPassage(chapter.title, chapter.content, selection)
  } catch (err) {
    console.error('askPassage failed', err)
    return NextResponse.json(
      { error: 'AI ask failed — try again in a moment' },
      { status: 502 },
    )
  }

  return NextResponse.json({ answer })
}
