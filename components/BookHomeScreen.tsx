'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, BookOpen, MessageSquare, Sparkles } from 'lucide-react'

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
    /**
     * Detected book language — controls the language of UI copy that
     * mirrors the book itself (e.g. the static Orientation prompt).
     * Fixed app-chrome strings (Library / Ask another / etc.) stay English.
     */
    lang: 'zh' | 'en'
  }
  questionHistory: Array<{
    id: string
    text: string
    createdAt: string | null
  }>
}

const ORIENT_COPY = {
  en: {
    eyebrow: 'Orient yourself · before you ask',
    subtitle: 'Read, think, then ask below before you ask other questions.',
    q1: 'What is this book about?',
    q2: "Who wrote it, and what's their background?",
    q3: 'Who is it written for?',
    q4: 'What do you want to take away from it?',
  },
  zh: {
    eyebrow: '认识这本书 · 提问之前',
    subtitle: '读这四个问题，自己心里过一遍，再到下方提问。',
    q1: '这本书写的是什么样的主题？',
    q2: '作者是谁，什么背景？',
    q3: '这本书是写给谁的？',
    q4: '你希望从这本书获得什么信息？',
  },
} as const

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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16">
      {/* Title */}
      <header className="flex flex-col gap-2">
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
          {book.title}
        </h1>
        {book.author && (
          <p className="text-base text-muted-foreground">by {book.author}</p>
        )}
      </header>

      {/* Overview */}
      {book.overview && (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-accent">
            Overview
          </h2>
          <p className="text-base leading-relaxed text-foreground/85">
            {book.overview}
          </p>
        </section>
      )}

      {/* Orient yourself — Rule 1 cognitive prompt. No input, no AI. The
          reader thinks through these silently before asking. Copy follows
          the detected book language so a Chinese book gets Chinese prompts. */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <h2
            className={
              book.lang === 'en'
                ? 'text-xs font-medium uppercase tracking-wider text-accent'
                : 'text-sm font-medium tracking-wider text-accent'
            }
          >
            {ORIENT_COPY[book.lang].eyebrow}
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {ORIENT_COPY[book.lang].subtitle}
        </p>
        <ol className="flex flex-col gap-2 text-base leading-relaxed text-foreground/85">
          <li>① {ORIENT_COPY[book.lang].q1}</li>
          <li>② {ORIENT_COPY[book.lang].q2}</li>
          <li>③ {ORIENT_COPY[book.lang].q3}</li>
          <li>④ {ORIENT_COPY[book.lang].q4}</li>
        </ol>
      </section>

      {/* Ask the book */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Ask the book
          </h2>
          <p className="text-base text-muted-foreground">
            Ask a question, and the right chapters find you.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors focus-within:border-foreground/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Ask anything about this book..."
            disabled={submitting}
            className="w-full resize-y border-0 bg-transparent px-1 py-1 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs text-destructive">{error}</span>
            <button
              type="button"
              onClick={() => submit(text)}
              disabled={submitting || text.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Asking…' : (
                <>
                  Ask
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {book.suggestedQuestions && book.suggestedQuestions.length > 0 && (
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Or try one of these
            </div>
            <ul className="flex flex-col gap-2">
              {book.suggestedQuestions.map((q, i) => (
                <li key={`${q}-${i}`}>
                  <button
                    type="button"
                    onClick={() => submit(q)}
                    disabled={submitting}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-secondary/50 disabled:opacity-50"
                  >
                    <span>{q}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Contents */}
      {book.toc && book.toc.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Contents
            </h2>
          </div>
          <ul className="flex flex-col rounded-xl border border-border bg-card py-2 text-sm">
            {book.toc.map((entry, i) => (
              <li
                key={`${entry.title}-${i}`}
                className="flex justify-between gap-3 px-4 py-1.5"
                style={{ paddingLeft: `${16 + (entry.level - 1) * 16}px` }}
              >
                <span
                  className={
                    entry.level === 1
                      ? 'font-medium text-foreground'
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

      {/* History */}
      {questionHistory.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your questions
            </h2>
          </div>
          <ul className="flex flex-col gap-2">
            {questionHistory.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/b/${book.id}/q/${q.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span>{q.text}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
