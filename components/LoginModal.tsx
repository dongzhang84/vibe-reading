'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface LoginModalProps {
  /** Full path to return to after sign-in. Used as `?next=` on OAuth and as
   *  in-place navigation target after email sign-in. */
  returnTo?: string
  onClose?: () => void
  onSuccess?: () => void
}

export function LoginModal({ returnTo, onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const nextPath =
    returnTo ??
    (typeof window !== 'undefined' ? window.location.pathname : '/library')

  async function handleGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    })
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    if (onSuccess) onSuccess()
  }

  const registerHref = `/auth/register?next=${encodeURIComponent(nextPath)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 shadow-xl">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-medium tracking-tight">
            Welcome to Vibe Reading.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You&apos;ve just seen how this book maps to your goal. To go
            deeper — read chapters, get briefs, check your understanding — we
            need to know who you are.
          </p>
          <p className="text-xs text-muted-foreground/80">
            Sign in, or create an account — same modal. This is the only time
            we&apos;ll ask.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            Continue with Google
          </button>
          <p className="-mt-3 text-xs text-muted-foreground/70">
            First time? Continue with Google creates your account automatically.
          </p>

          <div className="flex items-center gap-3">
            <hr className="flex-1 border-border" />
            <span className="text-xs text-muted-foreground">or email</span>
            <hr className="flex-1 border-border" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            No account yet?{' '}
            <Link
              href={registerHref}
              className="text-foreground hover:underline"
            >
              Sign up with email →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
