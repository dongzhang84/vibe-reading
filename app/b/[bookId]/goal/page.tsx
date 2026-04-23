import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { GoalForm } from '@/components/GoalForm'

interface Props {
  params: Promise<{ bookId: string }>
}

export default async function GoalPage({ params }: Props) {
  const { bookId } = await params

  const db = createAdminClient()
  const { data: book } = await db
    .from('books')
    .select('id, title, author, session_id, owner_id')
    .eq('id', bookId)
    .single()

  if (!book) notFound()

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const sessionId = await getSessionId()

  const authorized =
    (user && book.owner_id === user.id) ||
    (sessionId && book.session_id === sessionId)

  if (!authorized) {
    // Not this visitor's book (no matching session, not signed in as owner).
    // Send them home rather than leak existence.
    redirect('/')
  }

  const { data: existingGoal } = await db
    .from('goals')
    .select('text')
    .eq('book_id', bookId)
    .maybeSingle()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-12 px-6 py-20">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {book.author ? `${book.author} · ` : ''}
          {book.title}
        </p>
        <h1 className="text-2xl font-medium tracking-tight leading-snug text-foreground">
          Before we touch this book, tell us:
          <br />
          <span className="italic font-normal">
            What do you want to take away from it?
          </span>
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Write 1–3 sentences. Don&apos;t overthink. But you have to type
          something — this is the one thing that makes Vibe Reading different
          from every other reading tool.
        </p>
      </header>

      <GoalForm bookId={bookId} initialText={existingGoal?.text ?? ''} />
    </main>
  )
}
