'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'user'; email: string | null }

// Routes where the nav would compete with the page content. Question Result
// uses the full screen for the split pane; auth pages own their own flow.
const HIDE_PATTERNS: RegExp[] = [
  /^\/b\/[^/]+\/q\//,
  /^\/auth\//,
]

export function Nav() {
  const pathname = usePathname()

  // Auth state fetched client-side via /api/me. Keeping auth out of the
  // root layout lets the layout stay sync, which lets landing prerender
  // statically (CDN cache hit, no Vercel function cold start).
  //
  // Re-fetch on every pathname change. The Nav lives in the root layout,
  // so it does NOT re-mount on client-side navigation — without a
  // pathname dep, signing in via router.push() leaves the Nav showing
  // its pre-login state until the next full page reload. The cost is
  // one extra /api/me call per client nav, ~50ms; the route is
  // intentionally tiny (just user.email).
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { email: null }))
      .then((data: { email: string | null }) => {
        if (cancelled) return
        setAuth(
          data.email !== null
            ? { kind: 'user', email: data.email }
            : { kind: 'anon' },
        )
      })
      .catch(() => {
        if (!cancelled) setAuth({ kind: 'anon' })
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  if (HIDE_PATTERNS.some((re) => re.test(pathname ?? ''))) return null

  const nextParam = pathname && pathname !== '/'
    ? `?next=${encodeURIComponent(pathname)}`
    : ''

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-foreground" />
          <span className="font-medium text-foreground">Vibe Reading</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {auth.kind === 'loading' ? (
            // Reserve roughly the same width as the rendered buttons so
            // there's no layout shift when auth state arrives.
            <div className="h-8 w-32" aria-hidden />
          ) : auth.kind === 'user' ? (
            <>
              <Link
                href="/library"
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Library
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href={`/auth/login${nextParam}`}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href={`/auth/register${nextParam}`}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

function SignOutButton() {
  async function handleSignOut() {
    // Lazy-import the supabase client so the ~150 KB SDK doesn't land in
    // every page's initial bundle just to power one rarely-clicked button.
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }
  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      Sign out
    </button>
  )
}
