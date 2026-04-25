import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookHomeScreen } from '@/components/BookHomeScreen'
import type { TocEntry } from '@/lib/pdf/outline'

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
  const { data: book } = await db
    .from('books')
    .select('id, owner_id, title, author, toc, overview, suggested_questions')
    .eq('id', bookId)
    .single()
  if (!book || book.owner_id !== user.id) redirect('/library')

  const { data: questions } = await db
    .from('questions')
    .select('id, text, created_at')
    .eq('book_id', bookId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

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
      }}
      questionHistory={(questions ?? []).map((q) => ({
        id: q.id,
        text: q.text,
        createdAt: q.created_at,
      }))}
    />
  )
}
