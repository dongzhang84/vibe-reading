'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import {
  ChapterListPane,
  type ChapterMatchView,
} from './ChapterListPane'
import { BriefPane } from './BriefPane'
import { ReadPane } from './ReadPane'

interface ActivePane {
  mode: 'brief' | 'read'
  chapterId: string
  chapterTitle: string
  pageStart: number | null
}

interface Props {
  bookId: string
  bookTitle: string
  bookAuthor: string | null
  pdfUrl: string
  questionId: string
  questionText: string
  matches: ChapterMatchView[]
}

export function QuestionResultScreen({
  bookId,
  bookTitle,
  bookAuthor,
  pdfUrl,
  questionId,
  questionText,
  matches,
}: Props) {
  const [active, setActive] = useState<ActivePane | null>(null)

  return (
    <main className="grid h-screen grid-cols-1 lg:grid-cols-[2fr_3fr]">
      <ChapterListPane
        bookId={bookId}
        questionId={questionId}
        questionText={questionText}
        matches={matches}
        activeChapterId={active?.chapterId ?? null}
        activeMode={active?.mode ?? null}
        onBrief={(c) => setActive({ mode: 'brief', ...c })}
        onRead={(c) => setActive({ mode: 'read', ...c })}
      />
      <section className="flex h-full flex-col overflow-hidden bg-background">
        {!active && (
          <EmptyHint bookTitle={bookTitle} bookAuthor={bookAuthor} />
        )}
        {active?.mode === 'brief' && (
          <BriefPane
            key={`brief-${active.chapterId}`}
            bookId={bookId}
            chapterId={active.chapterId}
            chapterTitle={active.chapterTitle}
          />
        )}
        {active?.mode === 'read' && (
          <ReadPane
            key={`read-${active.chapterId}`}
            bookId={bookId}
            chapterId={active.chapterId}
            chapterTitle={active.chapterTitle}
            pdfUrl={pdfUrl}
            pageStart={active.pageStart ?? 1}
          />
        )}
      </section>
    </main>
  )
}

function EmptyHint({
  bookTitle,
  bookAuthor,
}: {
  bookTitle: string
  bookAuthor: string | null
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {bookAuthor ? `${bookAuthor} · ` : ''}
          {bookTitle}
        </p>
        <p className="max-w-sm text-base leading-relaxed text-muted-foreground/90">
          Pick a chapter on the left. Tap{' '}
          <span className="font-medium text-foreground">Brief</span> for the
          4-part structured note, or{' '}
          <span className="font-medium text-foreground">Read</span> to jump
          into the PDF.
        </p>
      </div>
    </div>
  )
}
