'use client'

import { useState } from 'react'
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
  chapterSeq: number
  pageStart: number | null
}

interface Props {
  bookId: string
  bookTitle: string
  bookAuthor: string | null
  pdfUrl: string
  questionText: string
  matches: ChapterMatchView[]
}

export function QuestionResultScreen({
  bookId,
  bookTitle,
  bookAuthor,
  pdfUrl,
  questionText,
  matches,
}: Props) {
  const [active, setActive] = useState<ActivePane | null>(null)

  return (
    <main className="grid h-screen grid-cols-1 lg:grid-cols-[2fr_3fr]">
      <ChapterListPane
        bookId={bookId}
        questionText={questionText}
        matches={matches}
        activeChapterId={active?.chapterId ?? null}
        activeMode={active?.mode ?? null}
        onBrief={(c) => setActive({ mode: 'brief', ...c })}
        onRead={(c) => setActive({ mode: 'read', ...c })}
      />
      <section className="flex h-full flex-col overflow-hidden">
        {!active && <EmptyHint bookTitle={bookTitle} bookAuthor={bookAuthor} />}
        {active?.mode === 'brief' && (
          <BriefPane
            key={`brief-${active.chapterId}`}
            bookId={bookId}
            chapterId={active.chapterId}
            chapterTitle={active.chapterTitle}
            chapterSeq={active.chapterSeq}
          />
        )}
        {active?.mode === 'read' && (
          <ReadPane
            key={`read-${active.chapterId}`}
            bookId={bookId}
            chapterId={active.chapterId}
            chapterTitle={active.chapterTitle}
            chapterSeq={active.chapterSeq}
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
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {bookAuthor ? `${bookAuthor} · ` : ''}
        {bookTitle}
      </p>
      <p className="max-w-md text-sm text-muted-foreground/80">
        Pick a chapter on the left, then choose <strong>Brief</strong> for the
        4-part structured note, or <strong>Read</strong> to jump into the PDF
        at that chapter.
      </p>
    </div>
  )
}
