import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReadScreen } from '@/components/ReadScreen'

interface Props {
  params: Promise<{ bookId: string; chapterId: string }>
}

const STORAGE_BUCKET = 'vr-docs'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

export default async function ReadPage({ params }: Props) {
  const { bookId, chapterId } = await params

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}/read/${chapterId}`)

  const db = createAdminClient()

  const { data: book } = await db
    .from('books')
    .select('id, title, author, owner_id, storage_path')
    .eq('id', bookId)
    .single()
  if (!book) notFound()
  if (book.owner_id !== user.id) redirect('/')

  const { data: chapter } = await db
    .from('chapters')
    .select('id, seq, title, book_id')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) notFound()

  // Short-lived signed URL so the browser can fetch the PDF directly from
  // Storage without going through Next. Bucket is private.
  const { data: signed, error: signError } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(book.storage_path, SIGNED_URL_TTL)
  if (signError || !signed?.signedUrl) {
    console.error('signed url failed', signError)
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="text-sm text-destructive">
          Could not load the PDF. Try refresh.
        </p>
      </main>
    )
  }

  return (
    <ReadScreen
      bookId={bookId}
      bookTitle={book.title}
      bookAuthor={book.author ?? null}
      chapterId={chapterId}
      chapterTitle={chapter.title}
      chapterSeq={chapter.seq}
      pdfUrl={signed.signedUrl}
    />
  )
}
