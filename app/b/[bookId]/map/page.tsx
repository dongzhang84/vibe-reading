import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { MapScreen } from '@/components/MapScreen'
import type { MapVerdict } from '@/lib/ai/mapper'

interface Props {
  params: Promise<{ bookId: string }>
}

export default async function MapPage({ params }: Props) {
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
  if (!authorized) redirect('/')

  // Rule 1 gate: must have a goal before mapping.
  const { data: goal } = await db
    .from('goals')
    .select('id, text')
    .eq('book_id', bookId)
    .maybeSingle()
  if (!goal) redirect(`/b/${bookId}/goal`)

  // Chapters (title + seq only; we don't need content for UI, just id→title).
  const { data: chapters } = await db
    .from('chapters')
    .select('id, seq, title')
    .eq('book_id', bookId)
    .order('seq', { ascending: true })

  // Cached map results, if any.
  const { data: cachedRaw } = await db
    .from('chapter_maps')
    .select('chapter_id, verdict, reason')
    .eq('book_id', bookId)
    .eq('goal_id', goal.id)

  const cached = (cachedRaw ?? []).map((r) => ({
    chapterId: r.chapter_id,
    verdict: r.verdict as MapVerdict,
    reason: r.reason,
  }))

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {book.author ? `${book.author} · ` : ''}
          {book.title}
        </p>
        <h1 className="text-base leading-relaxed text-foreground">
          Based on what you said:
          <br />
          <em className="text-foreground/80">&ldquo;{goal.text}&rdquo;</em>
        </h1>
        <h2 className="text-xl font-medium tracking-tight text-foreground">
          Here&apos;s how this book maps to your goal:
        </h2>
      </header>

      <MapScreen
        bookId={bookId}
        chapters={chapters ?? []}
        initialResults={cached}
      />

      <p className="text-xs text-muted-foreground">
        Not the right goal?{' '}
        <a
          href={`/b/${bookId}/goal`}
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Edit my goal ↺
        </a>
      </p>
    </main>
  )
}
