import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { briefChapter, type Brief } from '@/lib/ai/briefer'

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

  // Brief requires login (middleware already gates /b/*/brief/* pages, but
  // the API is called via fetch so we re-check here).
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Ownership: book must belong to this user (after Phase 7 claim).
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
    .select('id, text')
    .eq('book_id', bookId)
    .maybeSingle()
  if (!goal) {
    return NextResponse.json({ error: 'No goal set' }, { status: 403 })
  }

  // Chapter must belong to the book.
  const { data: chapter } = await db
    .from('chapters')
    .select('id, title, content, book_id')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  // Cache check: briefs is unique on (chapter_id, goal_id).
  const { data: cached } = await db
    .from('briefs')
    .select('one_sentence, key_claims, example, not_addressed')
    .eq('chapter_id', chapterId)
    .eq('goal_id', goal.id)
    .maybeSingle()
  if (cached) {
    const brief: Brief = {
      one_sentence: cached.one_sentence,
      key_claims: normalizeKeyClaims(cached.key_claims),
      example: cached.example,
      not_addressed: cached.not_addressed,
    }
    return NextResponse.json({ cached: true, brief })
  }

  // Generate.
  let brief: Brief
  try {
    brief = await briefChapter(goal.text, chapter.title, chapter.content)
  } catch (err) {
    console.error('briefChapter failed', err)
    return NextResponse.json(
      { error: 'AI brief failed — try again in a moment' },
      { status: 502 },
    )
  }

  if (!brief.one_sentence || brief.key_claims.length !== 3) {
    return NextResponse.json(
      { error: 'Model returned a malformed brief' },
      { status: 502 },
    )
  }

  await db.from('briefs').insert({
    chapter_id: chapterId,
    goal_id: goal.id,
    one_sentence: brief.one_sentence,
    key_claims: brief.key_claims,
    example: brief.example,
    not_addressed: brief.not_addressed,
  })

  return NextResponse.json({ cached: false, brief })
}

function normalizeKeyClaims(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').slice(0, 3)
}
