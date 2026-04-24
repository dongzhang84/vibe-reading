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
  const [submittedText, setSubmittedText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const tooShort = text.trim().length < MIN_CHARS

  async function submit() {
    if (tooShort || submitting) return
    setSubmitting(true)
    setError(null)
    const trimmed = text.trim()
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId, text: trimmed }),
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
      setSubmittedText(trimmed)
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
          {submitting ? 'Reading along…' : 'Done — see one more angle →'}
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-10">
      {/* Echo back what the reader wrote, soft. Not as a "check" — just
          part of the conversation. */}
      <Block label="What you wrote">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/80">
          {submittedText}
        </p>
      </Block>

      {result.angles && (
        <Block label="Another angle from the chapter">
          <p className="text-base leading-relaxed text-foreground">
            {result.angles}
          </p>
        </Block>
      )}

      {result.follow_up && (
        <Block label="If you want to push further">
          <p className="text-base leading-relaxed text-foreground/90">
            {result.follow_up}
          </p>
        </Block>
      )}

      <footer className="flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/b/${bookId}/map`}
          className="rounded-md bg-primary px-5 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Next chapter →
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

function Block({
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
