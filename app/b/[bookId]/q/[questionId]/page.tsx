import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { QuestionResultScreen } from '@/components/QuestionResultScreen'
import type { ChapterMatchView } from '@/components/ChapterListPane'

const SIGNED_URL_SECONDS = 60 * 60 // 1 hour

export default async function QuestionResultPage({
  params,
}: {
  params: Promise<{ bookId: string; questionId: string }>
}) {
  const { bookId, questionId } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/auth/login?next=/b/${bookId}/q/${questionId}`)
  }

  const db = createAdminClient()

  const { data: question } = await db
    .from('questions')
    .select('id, book_id, user_id, text')
    .eq('id', questionId)
    .single()
  if (
    !question ||
    question.user_id !== user.id ||
    question.book_id !== bookId
  ) {
    redirect(`/b/${bookId}`)
  }

  const { data: bookRaw } = await db
    .from('books')
    .select('id, owner_id, title, author, storage_path, format')
    .eq('id', bookId)
    .single()
  // `format` is a v2.4 column; types/db.ts hasn't been regenerated yet
  // so we widen at the boundary instead of casting the select string
  // (which kills inference of every other field).
  const book = bookRaw as
    | {
        id: string
        owner_id: string
        title: string
        author: string | null
        storage_path: string
        format: 'pdf' | 'epub' | null
      }
    | null
  if (!book || book.owner_id !== user.id) {
    redirect('/library')
  }
  const bookFormat: 'pdf' | 'epub' = book.format === 'epub' ? 'epub' : 'pdf'

  const { data: rawMatches } = await db
    .from('question_chapters')
    .select(
      'id, chapter_id, reason, rank, chapters(id, seq, title, page_start)',
    )
    .eq('question_id', questionId)
    .order('rank')

  const matches: ChapterMatchView[] = (rawMatches ?? []).map((m) => {
    const ch = (m.chapters ?? null) as
      | { id: string; seq: number; title: string; page_start: number | null }
      | null
    return {
      questionChapterId: m.id,
      chapterId: m.chapter_id,
      chapterTitle: ch?.title ?? null,
      chapterSeq: ch?.seq ?? null,
      pageStart: ch?.page_start ?? null,
      reason: m.reason,
      rank: m.rank,
    }
  })

  // EPUB books don't need a signed URL — the Read pane fetches per-chapter
  // HTML via /api/chapter/[id]/html instead. Skip the round-trip.
  let pdfUrl = ''
  if (bookFormat === 'pdf') {
    const { data: signed } = await db.storage
      .from('vr-docs')
      .createSignedUrl(book.storage_path, SIGNED_URL_SECONDS)
    pdfUrl = signed?.signedUrl ?? ''
  }

  return (
    <QuestionResultScreen
      bookId={bookId}
      bookTitle={book.title}
      bookAuthor={book.author}
      bookFormat={bookFormat}
      pdfUrl={pdfUrl}
      questionId={questionId}
      questionText={question.text}
      matches={matches}
    />
  )
}
