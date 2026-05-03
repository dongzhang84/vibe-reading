import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookHomeScreen } from '@/components/BookHomeScreen'
import { getSessionId } from '@/lib/session'
import { claimSessionBooks } from '@/lib/auth/claim'
import type { TocEntry } from '@/lib/pdf/outline'
import { pickBookLang } from '@/lib/text/lang'

export default async function BookHomePage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}`)

  const db = createAdminClient()
  let { data: book } = await db
    .from('books')
    .select(
      'id, owner_id, session_id, title, author, toc, overview, suggested_questions',
    )
    .eq('id', bookId)
    .single()
  if (!book) redirect('/library')

  // Defensive claim: an Email-login flow can land here with the book still
  // bound to the session cookie (Email login skips /auth/callback). If the
  // book is unowned and our session matches, attach it to this user inline.
  if (book.owner_id === null) {
    const sessionId = await getSessionId()
    if (sessionId && book.session_id === sessionId) {
      await claimSessionBooks({ userId: user.id, sessionId })
      const { data: refreshed } = await db
        .from('books')
        .select(
          'id, owner_id, session_id, title, author, toc, overview, suggested_questions',
        )
        .eq('id', bookId)
        .single()
      if (refreshed) book = refreshed
    }
  }
  if (book.owner_id !== user.id) redirect('/library')

  const { data: questions } = await db
    .from('questions')
    .select('id, text, created_at')
    .eq('book_id', bookId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const lang = pickBookLang({
    overview: book.overview,
    title: book.title,
  })

  return (
    <BookHomeScreen
      book={{
        id: book.id,
        title: book.title,
        author: book.author,
        toc: (book.toc as TocEntry[] | null) ?? null,
        overview: book.overview,
        suggestedQuestions:
          (book.suggested_questions as string[] | null) ?? null,
        lang,
      }}
      questionHistory={(questions ?? []).map((q) => ({
        id: q.id,
        text: q.text,
        createdAt: q.created_at,
      }))}
    />
  )
}
