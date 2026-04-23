import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BriefScreen } from '@/components/BriefScreen'
import type { Brief } from '@/lib/ai/briefer'

interface Props {
  params: Promise<{ bookId: string; chapterId: string }>
}

export default async function BriefPage({ params }: Props) {
  const { bookId, chapterId } = await params

  // Middleware enforces auth for /b/*/brief/*, but re-check here.
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}/brief/${chapterId}`)

  const db = createAdminClient()

  const { data: book } = await db
    .from('books')
    .select('id, title, author, owner_id')
    .eq('id', bookId)
    .single()
  if (!book) notFound()
  if (book.owner_id !== user.id) redirect('/')

  const { data: goal } = await db
    .from('goals')
    .select('id, text')
    .eq('book_id', bookId)
    .maybeSingle()
  if (!goal) redirect(`/b/${bookId}/goal`)

  const { data: chapter } = await db
    .from('chapters')
    .select('id, seq, title, book_id')
    .eq('id', chapterId)
    .single()
  if (!chapter || chapter.book_id !== bookId) notFound()

  // Cache lookup — render instantly if present.
  const { data: cached } = await db
    .from('briefs')
    .select('one_sentence, key_claims, example, not_addressed')
    .eq('chapter_id', chapterId)
    .eq('goal_id', goal.id)
    .maybeSingle()

  const initialBrief: Brief | null = cached
    ? {
        one_sentence: cached.one_sentence,
        key_claims: Array.isArray(cached.key_claims)
          ? (cached.key_claims as string[])
          : [],
        example: cached.example,
        not_addressed: cached.not_addressed,
      }
    : null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {book.author ? `${book.author} · ` : ''}
          {book.title}
        </p>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Chapter {chapter.seq + 1}: {chapter.title}
        </h1>
      </header>

      <BriefScreen
        bookId={bookId}
        chapterId={chapterId}
        initialBrief={initialBrief}
      />

      <footer className="flex flex-col items-stretch gap-3 border-t border-border pt-8">
        <p className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed text-foreground">
          ⚠️ Reading a brief is not understanding. Now you need to do the work.
        </p>
        <Link
          href={`/b/${bookId}/restate/${chapterId}`}
          className="self-stretch rounded-md bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Now I&apos;ll restate this in my own words →
        </Link>
      </footer>
    </main>
  )
}
