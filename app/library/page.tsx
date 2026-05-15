import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Upload } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { claimSessionBooks } from '@/lib/auth/claim'
import { LibraryList } from '@/components/LibraryList'
import {
  STORAGE_BYTES_CAP_PER_USER,
  BOOK_COUNT_CAP_PER_USER,
} from '@/lib/usage/quota'

// Middleware already protects /library, but re-check here so this page
// works even if someone removes the matcher entry later.
export default async function LibraryPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/library')

  // Defensive claim — covers the case where the user uploaded pre-login,
  // signed in via a path that didn't run claim (e.g. Email + earlier bug),
  // and ended up here with their session book still unowned.
  const sessionId = await getSessionId()
  if (sessionId) {
    try {
      await claimSessionBooks({ userId: user.id, sessionId })
    } catch (err) {
      console.error('library defensive claim failed', err)
    }
  }

  const db = createAdminClient()
  const { data: books } = await db
    .from('books')
    .select(
      'id, title, author, page_count, format, created_at, size_bytes',
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  // Latest question text per book — gives returning readers an instant
  // "what was I thinking about" signal on the card. One DB round-trip; we
  // dedupe to first-occurrence (the .order desc above) in JS to avoid
  // needing a window function.
  const bookIds = (books ?? []).map((b) => b.id)
  const latestByBook = new Map<string, string>()
  if (bookIds.length > 0) {
    const { data: questions } = await db
      .from('questions')
      .select('book_id, text, created_at')
      .in('book_id', bookIds)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)
    for (const q of questions ?? []) {
      if (!latestByBook.has(q.book_id)) latestByBook.set(q.book_id, q.text)
    }
  }
  // DB stores `format` as plain text + a check constraint (pdf | epub),
  // so the generated type is `string`. Narrow for LibraryList here.
  const enriched = (books ?? []).map((b) => ({
    ...b,
    format: (b.format === 'epub' ? 'epub' : 'pdf') as 'pdf' | 'epub',
    lastAsked: latestByBook.get(b.id) ?? null,
  }))

  const isEmpty = enriched.length === 0

  const usedBytes = (books ?? []).reduce(
    (sum, b) => sum + (b.size_bytes ?? 0),
    0,
  )
  const usedMB = (usedBytes / (1024 * 1024)).toFixed(1)
  const capMB = Math.round(STORAGE_BYTES_CAP_PER_USER / (1024 * 1024))
  const usedBooks = enriched.length

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Your Library
          </h1>
          <p className="text-base text-muted-foreground">
            Click a book to ask a new question or reopen an old one.
          </p>
          {!isEmpty && (
            <p className="mt-1 text-xs text-muted-foreground/70 tabular-nums">
              {usedMB} MB / {capMB} MB used · {usedBooks} /{' '}
              {BOOK_COUNT_CAP_PER_USER} books
            </p>
          )}
        </div>
        {!isEmpty && (
          <Link
            href="/"
            className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:self-auto"
          >
            <Upload className="h-4 w-4" />
            Upload another
          </Link>
        )}
      </header>

      {isEmpty ? (
        <section className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No books yet.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Upload your first
          </Link>
        </section>
      ) : (
        <LibraryList books={enriched} />
      )}
    </main>
  )
}
