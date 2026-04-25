'use client'

import Link from 'next/link'

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
  chapterSeq: number
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
    <aside className="flex h-full flex-col gap-6 overflow-y-auto border-r border-border p-6">
      <header className="flex flex-col gap-3">
        <Link
          href={`/b/${bookId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to book
        </Link>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Your question
        </p>
        <p className="text-base leading-relaxed text-foreground">
          {questionText}
        </p>
      </header>

      {matches.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          AI mapping is unavailable for this question. You can still browse the
          book directly from{' '}
          <Link
            href={`/b/${bookId}`}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Book Home
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li
              key={m.questionChapterId}
              className={`flex flex-col gap-2 rounded-md border p-3 ${
                m.chapterId && m.chapterId === activeChapterId
                  ? 'border-foreground/60 bg-muted/20'
                  : 'border-border bg-background'
              }`}
            >
              {m.chapterId === null ? (
                <p className="text-sm font-medium text-foreground">
                  📖 Book-level — read intro + conclusion
                </p>
              ) : (
                <p className="text-sm font-medium text-foreground">
                  Chapter {(m.chapterSeq ?? 0) + 1}:{' '}
                  {m.chapterTitle ?? '(untitled)'}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {m.reason}
              </p>
              {m.chapterId && m.chapterTitle !== null && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onBrief({
                        chapterId: m.chapterId!,
                        chapterTitle: m.chapterTitle!,
                        chapterSeq: m.chapterSeq ?? 0,
                        pageStart: m.pageStart,
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeMode === 'brief' && activeChapterId === m.chapterId
                        ? 'bg-foreground text-background'
                        : 'border border-border text-foreground hover:border-foreground/60'
                    }`}
                  >
                    Brief
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRead({
                        chapterId: m.chapterId!,
                        chapterTitle: m.chapterTitle!,
                        chapterSeq: m.chapterSeq ?? 0,
                        pageStart: m.pageStart,
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeMode === 'read' && activeChapterId === m.chapterId
                        ? 'bg-foreground text-background'
                        : 'border border-border text-foreground hover:border-foreground/60'
                    }`}
                  >
                    Read
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
