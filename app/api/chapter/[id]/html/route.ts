import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Returns the sanitized HTML body of an EPUB chapter for rendering in
 * the Read pane. PDF chapters have no content_html — request returns
 * 204 in that case (the client should be calling PdfViewer instead).
 *
 * Ownership: caller must own the book that contains this chapter.
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
  // `content_html` is a v2.4 column; types/db.ts hasn't been regenerated.
  // Widen the result at the boundary.
  const { data: chapterRaw } = await db
    .from('chapters')
    .select('id, content_html, books(owner_id)')
    .eq('id', id)
    .single()
  const chapter = chapterRaw as
    | {
        id: string
        content_html: string | null
        books: { owner_id: string } | null
      }
    | null

  if (!chapter) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (chapter.books?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // PDF chapters have null content_html — let the client know to fall
  // back to the PdfViewer code path.
  if (!chapter.content_html) {
    return NextResponse.json({ contentHtml: null }, { status: 200 })
  }
  return NextResponse.json({ contentHtml: chapter.content_html })
}
