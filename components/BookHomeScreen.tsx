'use client'

import Link from 'next/link'
import { useState } from 'react'

interface TocEntry {
  title: string
  level: number
  page: number
}

interface BookHomeScreenProps {
  book: {
    id: string
    title: string
    author: string | null
    toc: TocEntry[] | null
    overview: string | null
    suggestedQuestions: string[] | null
  }
  questionHistory: Array<{
    id: string
    text: string
    createdAt: string | null
  }>
}

export function BookHomeScreen({
  book,
  questionHistory,
}: BookHomeScreenProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(value: string) {
    if (submitting) return
    const trimmed = value.trim()
    if (trimmed.length < 3) {
      setError('Question is too short.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId: book.id, text: trimmed }),
      })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Submit failed' }))
        setError(apiError ?? 'Submit failed')
        setSubmitting(false)
        return
      }
      const { questionId } = await res.json()
      window.location.href = `/b/${book.id}/q/${questionId}`
    } catch {
      setError('Network error. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-4">
        <Link
          href="/library"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Library
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {book.title}
          </h1>
          {book.author && (
            <p className="text-sm text-muted-foreground">by {book.author}</p>
          )}
        </div>
      </header>

      {book.overview && (
        <section className="rounded-md border border-border bg-muted/20 p-4">
          <p className="text-sm leading-relaxed text-foreground/85">
            {book.overview}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Ask the book
          </h2>
          <p className="text-xs text-muted-foreground/80">
            Vibe Reading won&apos;t summarize until you ask.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ask anything about this book..."
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-foreground"
          disabled={submitting}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-destructive">{error}</span>
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={submitting || text.trim().length < 3}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Asking…' : 'Ask →'}
          </button>
        </div>

        {book.suggestedQuestions && book.suggestedQuestions.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Or try one of these:
            </p>
            <ul className="flex flex-col gap-2">
              {book.suggestedQuestions.map((q, i) => (
                <li key={`${q}-${i}`}>
                  <button
                    type="button"
                    onClick={() => submit(q)}
                    disabled={submitting}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground hover:border-foreground/50 disabled:opacity-50"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {book.toc && book.toc.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Contents
          </h2>
          <ul className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            {book.toc.map((entry, i) => (
              <li
                key={`${entry.title}-${i}`}
                className="flex justify-between gap-3 py-0.5"
                style={{ paddingLeft: `${(entry.level - 1) * 16}px` }}
              >
                <span
                  className={
                    entry.level === 1
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {entry.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  p.{entry.page}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questionHistory.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Your questions
          </h2>
          <ul className="flex flex-col gap-2">
            {questionHistory.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/b/${book.id}/q/${q.id}`}
                  className="block rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:border-foreground/50"
                >
                  {q.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
