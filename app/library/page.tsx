import Link from 'next/link'
import { redirect } from 'next/navigation'
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Your Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Books you&apos;ve uploaded. Click one to ask a new question or
            reopen an old one.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40"
        >
          + Upload another
        </Link>
      </header>

      {!books || books.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-8 text-sm text-muted-foreground">
          <p>No books yet.</p>
          <Link
            href="/"
            className="text-foreground underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            Upload your first →
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {books.map((b) => (
            <li key={b.id}>
              <Link
                href={`/b/${b.id}`}
                className="flex flex-col gap-1 rounded-md border border-border bg-background p-4 hover:border-foreground/50"
              >
                <p className="text-base font-medium text-foreground">
                  {b.title}
                </p>
                {b.author && (
                  <p className="text-sm text-muted-foreground">{b.author}</p>
                )}
                <p className="text-xs text-muted-foreground/80">
                  {b.page_count ? `${b.page_count} pages · ` : ''}
                  added {formatDate(b.created_at)}
                </p>
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
