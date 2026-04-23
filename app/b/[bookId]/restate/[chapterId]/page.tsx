import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { RestateScreen } from '@/components/RestateScreen'

interface Props {
  params: Promise<{ bookId: string; chapterId: string }>
}

export default async function RestatePage({ params }: Props) {
  const { bookId, chapterId } = await params

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}/restate/${chapterId}`)

  const db = createAdminClient()

  const { data: book } = await db
    .from('books')
    .select('id, title, author, owner_id')
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {book.author ? `${book.author} · ` : ''}
          {book.title}
        </p>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Now restate Chapter {chapter.seq + 1} in your own words.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Don&apos;t paraphrase the AI. Use your own language, your own
          analogies. If you can say it without the book open, it&apos;s yours.
        </p>
      </header>

      <RestateScreen bookId={bookId} chapterId={chapterId} />
    </main>
  )
}
