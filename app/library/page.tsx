import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Upload } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { claimSessionBooks } from '@/lib/auth/claim'

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
    .select('id, title, author, page_count, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  const isEmpty = !books || books.length === 0

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
        <ul className="flex flex-col gap-3">
          {books.map((b) => (
            <li key={b.id}>
              <Link
                href={`/b/${b.id}`}
                className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary/50"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-foreground/5">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium text-foreground">{b.title}</p>
                  {b.author && (
                    <p className="text-sm text-muted-foreground">{b.author}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {b.page_count ? `${b.page_count} pages · ` : ''}
                    added {formatDate(b.created_at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function formatDate(v: string | null): string {
  if (!v) return ''
  try {
    const d = new Date(v)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}
