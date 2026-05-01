'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, RefreshCw } from 'lucide-react'

export interface ChapterMatchView {
  questionChapterId: string
  chapterId: string | null
  chapterTitle: string | null
  chapterSeq: number | null
  pageStart: number | null
  reason: string
  rank: number
}

interface ActiveChapter {
  chapterId: string
  chapterTitle: string
  pageStart: number | null
}

interface Props {
  bookId: string
  questionId: string
  questionText: string
  matches: ChapterMatchView[]
  activeChapterId: string | null
  activeMode: 'brief' | 'read' | null
  onBrief: (c: ActiveChapter) => void
  onRead: (c: ActiveChapter) => void
}

export function ChapterListPane({
  bookId,
  questionId,
  questionText,
  matches,
  activeChapterId,
  activeMode,
  onBrief,
  onRead,
}: Props) {
  return (
    <aside className="flex h-full flex-col gap-6 overflow-y-auto border-r border-border bg-secondary/30 p-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/library"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Library
        </Link>
        <Link
          href={`/b/${bookId}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          Ask another question
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Your Question
          </p>
          <p className="text-balance text-lg leading-snug text-foreground">
            {questionText}
          </p>
        </div>
      </header>

      {matches.length === 0 ? (
        <EmptyMatches bookId={bookId} questionId={questionId} />
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => {
            const isActive =
              m.chapterId !== null && m.chapterId === activeChapterId
            return (
              <li
                key={m.questionChapterId}
                className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
                  isActive
                    ? 'border-foreground/30 bg-card shadow-sm'
                    : 'border-border bg-card hover:bg-secondary/60'
                }`}
              >
                {m.chapterId === null ? (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                    </div>
                    <p className="font-medium text-foreground">
                      Book-level — read intro + conclusion
                    </p>
                  </div>
                ) : (
                  <p className="font-medium text-foreground">
                    {m.chapterTitle ?? '(untitled)'}
                  </p>
                )}

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.reason}
                </p>

                {m.chapterId && m.chapterTitle !== null && (
                  <div className="flex items-center gap-2 pt-1">
                    <PaneButton
                      label="Brief"
                      active={
                        activeMode === 'brief' &&
                        activeChapterId === m.chapterId
                      }
                      onClick={() =>
                        onBrief({
                          chapterId: m.chapterId!,
                          chapterTitle: m.chapterTitle!,
                          pageStart: m.pageStart,
                        })
                      }
                    />
                    <PaneButton
                      label="Read"
                      active={
                        activeMode === 'read' &&
                        activeChapterId === m.chapterId
                      }
                      onClick={() =>
                        onRead({
                          chapterId: m.chapterId!,
                          chapterTitle: m.chapterTitle!,
                          pageStart: m.pageStart,
                        })
                      }
                    />
                    {isActive && (
                      <span className="ml-auto inline-flex items-center text-xs text-muted-foreground">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function EmptyMatches({
  bookId,
  questionId,
}: {
  bookId: string
  questionId: string
}) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  async function retry() {
    if (retrying) return
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch(`/api/question/${questionId}/retry`, {
        method: 'POST',
      })
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: 'Retry failed' }))
        setRetryError(error ?? 'Retry failed')
        setRetrying(false)
        return
      }
      // Reload to pick up the freshly-saved question_chapters from the
      // server component on the page.
      window.location.reload()
    } catch {
      setRetryError('Network error.')
      setRetrying(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">
        AI couldn&apos;t map this question to specific chapters.
      </p>
      <p className="text-xs text-muted-foreground/80">
        Try again — the model may give a different read. Or rephrase the
        question and ask again.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`}
          />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
        <Link
          href={`/b/${bookId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          Ask another question
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {retryError && (
        <p className="text-xs text-destructive">{retryError}</p>
      )}
    </div>
  )
}

function PaneButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border bg-background text-foreground hover:bg-secondary'
      }`}
    >
      {label}
    </button>
  )
}
