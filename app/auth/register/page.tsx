'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/library'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Email registration creates the session client-side without going through
    // /auth/callback — claim explicitly so any pre-login uploaded book gets
    // attached to the new user.
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
          Create account
        </h1>
        <p className="text-sm text-muted-foreground">
          Email and password. Or{' '}
          <Link
            href={`/auth/login${next !== '/library' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="text-foreground transition-opacity hover:opacity-80"
          >
            continue with Google
          </Link>
          .
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoComplete="new-password"
            required
            minLength={8}
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
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={`/auth/login${next !== '/library' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-foreground transition-opacity hover:opacity-80"
        >
          Sign in
        </Link>
      </p>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}
