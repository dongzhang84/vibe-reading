'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/library'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Email path doesn't go through /auth/callback — claim any session books
    // explicitly so the user lands on /b/[id] as owner.
    await fetch('/api/claim', { method: 'POST' }).catch(() => {})
    router.push(next)
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-20">
      <Link
        href="/"
        className="flex items-center gap-2 self-start text-foreground transition-opacity hover:opacity-80"
      >
        <BookOpen className="h-5 w-5" />
        <span className="font-medium">Vibe Reading</span>
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in, or create an account — same modal. This is the only time
          we&apos;ll ask.
        </p>
      </header>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Continue with Google
      </button>
      <p className="-mt-5 text-xs text-muted-foreground">
        First time? Continue with Google creates your account automatically.
      </p>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <hr className="flex-1 border-border" />
      </div>

      <form onSubmit={handleEmail} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-foreground">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/40"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-foreground">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/40"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account yet?{' '}
        <Link
          href={`/auth/register${next !== '/library' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-foreground transition-opacity hover:opacity-80"
        >
          Sign up with email →
        </Link>
      </p>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
