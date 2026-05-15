import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Returns every chapter's sanitized content_html for a single book, in
 * spine order. Powers the EPUB Read pane's continuous-scroll view:
 * clicking "Read" on chapter 5 positions the reader at chapter 5 but
 * keeps chapters 6, 7, … available by scrolling down (matching the
 * PDF flow where you can keep reading past the start page).
 *
 * Ownership: caller must own the book. We don't expose chapters of
 * a book they don't own even if they know the id.
 *
 * Cache: 60s browser cache. The user typically re-enters the Read
 * pane several times per session (Brief ↔ Read toggle, chapter
 * switches); a short cache avoids re-fetching ~200 KB each time.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params

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
    .select('owner_id')
    .eq('id', id)
    .single()
  if (!book) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (book.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: chapters } = await db
    .from('chapters')
    .select('id, seq, title, content_html')
    .eq('book_id', id)
    .order('seq')

  return NextResponse.json(
    {
      chapters: (chapters ?? []).map((c) => ({
        id: c.id,
        seq: c.seq,
        title: c.title,
        contentHtml: c.content_html,
      })),
    },
    {
      headers: {
        'cache-control': 'private, max-age=60',
      },
    },
  )
}
