'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from './ThemeToggle'

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
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-foreground" />
          <span className="font-medium text-foreground">Vibe Reading</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {user ? (
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
