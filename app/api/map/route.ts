import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { mapChapters, type MapResult, type MapVerdict } from '@/lib/ai/mapper'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.bookId !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const bookId: string = body.bookId

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

  // Rule 1: a goal must exist before anything AI-related runs.
  const { data: goal } = await db
    .from('goals')
    .select('id, text')
    .eq('book_id', bookId)
    .maybeSingle()
  if (!goal) {
    return NextResponse.json({ error: 'No goal set' }, { status: 403 })
  }

  // Cache lookup. chapter_maps is unique on (goal_id, chapter_id).
  const { data: cached } = await db
    .from('chapter_maps')
    .select('chapter_id, verdict, reason')
    .eq('book_id', bookId)
    .eq('goal_id', goal.id)

  if (cached && cached.length > 0) {
    const results: MapResult[] = cached.map((row) => ({
      chapterId: row.chapter_id,
      verdict: row.verdict as MapVerdict,
      reason: row.reason,
    }))
    return NextResponse.json({ cached: true, results })
  }

  // Fetch chapters (title + beginning of content only — never full text).
  const { data: chapters, error: chaptersError } = await db
    .from('chapters')
    .select('id, seq, title, content')
    .eq('book_id', bookId)
    .order('seq', { ascending: true })
  if (chaptersError || !chapters || chapters.length === 0) {
    return NextResponse.json({ error: 'No chapters' }, { status: 422 })
  }

  const input = chapters.map((c) => ({
    id: c.id,
    seq: c.seq,
    title: c.title,
    firstParagraph: c.content.slice(0, 500),
  }))

  let results: MapResult[]
  try {
    results = await mapChapters(goal.text, input)
  } catch (err) {
    console.error('mapChapters failed', err)
    return NextResponse.json(
      { error: 'AI mapping failed — try again in a moment' },
      { status: 502 },
    )
  }

  if (results.length === 0) {
    return NextResponse.json(
      { error: 'Model returned no usable results' },
      { status: 502 },
    )
  }

  // Write cache. Ignore insert errors that would duplicate (race).
  await db.from('chapter_maps').insert(
    results.map((r) => ({
      book_id: bookId,
      goal_id: goal.id,
      chapter_id: r.chapterId,
      verdict: r.verdict,
      reason: r.reason,
    })),
  )

  return NextResponse.json({ cached: false, results })
}
