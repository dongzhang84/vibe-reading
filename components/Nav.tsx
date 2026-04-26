'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface NavUser {
  email: string | null
}

interface Props {
  user: NavUser | null
}

// Routes where the nav would compete with the page content. Question Result
// uses the full screen for the split pane; auth pages own their own flow.
const HIDE_PATTERNS: RegExp[] = [
  /^\/b\/[^/]+\/q\//,
  /^\/auth\//,
]

export function Nav({ user }: Props) {
  const pathname = usePathname()
  if (HIDE_PATTERNS.some((re) => re.test(pathname ?? ''))) return null

  const nextParam = pathname && pathname !== '/'
    ? `?next=${encodeURIComponent(pathname)}`
    : ''

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          Vibe Reading
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link
                href="/library"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                Library
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href={`/auth/login${nextParam}`}
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href={`/auth/register${nextParam}`}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Hard reload so the server layout re-fetches user and the nav re-renders
    // with the signed-out variant.
    window.location.href = '/'
  }
  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      Sign out
    </button>
  )
}
