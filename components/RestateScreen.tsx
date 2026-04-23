'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CheckResult } from '@/lib/ai/checker'

interface Props {
  bookId: string
  chapterId: string
}

const MIN_CHARS = 30

export function RestateScreen({ bookId, chapterId }: Props) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tooShort = text.trim().length < MIN_CHARS

  async function submit() {
    if (tooShort || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId, text: text.trim() }),
      })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Check failed' }))
        setError(apiError ?? 'Check failed')
        setSubmitting(false)
        return
      }
      const { result: r } = (await res.json()) as { result: CheckResult }
      setResult(r)
      setSubmitting(false)
    } catch {
      setError('Network error. Try again.')
      setSubmitting(false)
    }
  }

  if (!result) {
    return (
      <section className="flex flex-col gap-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Explain what this chapter is actually saying. Imagine you're telling a friend who hasn't read it."
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-base leading-relaxed outline-none focus:border-foreground"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {text.trim().length}/{MIN_CHARS} min
          </span>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={tooShort || submitting}
          className="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Checking…' : 'Check my understanding →'}
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-10">
      {result.got_right.length > 0 && (
        <ResultBlock label="Where you got it right:">
          <ul className="flex flex-col gap-2 text-base leading-relaxed text-foreground">
            {result.got_right.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </ResultBlock>
      )}

      {result.missed.length > 0 && (
        <ResultBlock label="Where you missed something important:">
          <ul className="flex flex-col gap-2 text-base leading-relaxed text-foreground">
            {result.missed.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-amber-600 dark:text-amber-400">✗</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </ResultBlock>
      )}

      {result.got_right.length === 0 && result.missed.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The model didn&apos;t return specific points. Try a longer
          restatement — the more you say, the more there is to react to.
        </p>
      )}

      {result.follow_up && (
        <ResultBlock label="Follow-up question to deepen it:">
          <p className="text-base leading-relaxed text-foreground">
            {result.follow_up}
          </p>
        </ResultBlock>
      )}

      <footer className="flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/b/${bookId}/map`}
          className="rounded-md bg-primary px-5 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Got it. Next chapter →
        </Link>
        <Link
          href="/library"
          className="text-center text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          I&apos;m done with this book
        </Link>
      </footer>
    </section>
  )
}

function ResultBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  )
}
