'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'

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
  questionText: string
  matches: ChapterMatchView[]
  activeChapterId: string | null
  activeMode: 'brief' | 'read' | null
  onBrief: (c: ActiveChapter) => void
  onRead: (c: ActiveChapter) => void
}

export function ChapterListPane({
  bookId,
  questionText,
  matches,
  activeChapterId,
  activeMode,
  onBrief,
  onRead,
}: Props) {
  return (
    <aside className="flex h-full flex-col gap-6 overflow-y-auto border-r border-border bg-secondary/30 p-6">
      <header className="flex flex-col gap-4">
        <Link
          href={`/b/${bookId}`}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to book
        </Link>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Your Question
          </p>
          <p className="text-balance text-lg leading-snug text-foreground">
            {questionText}
          </p>
        </div>
      </header>

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            AI mapping is unavailable for this question.
          </p>
          <Link
            href={`/b/${bookId}`}
            className="text-sm text-foreground underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            Browse the book directly →
          </Link>
        </div>
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
