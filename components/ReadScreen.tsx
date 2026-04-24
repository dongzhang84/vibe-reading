'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'

// react-pdf touches `window` / worker imports at module load — load it only
// on the client, not during the server render pass.
const PdfViewer = dynamic(
  () => import('@/components/PdfViewer').then((m) => m.PdfViewer),
  { ssr: false, loading: () => <p className="py-8 text-sm text-muted-foreground">Loading viewer…</p> },
)

interface Props {
  bookId: string
  bookTitle: string
  bookAuthor: string | null
  chapterId: string
  chapterTitle: string
  chapterSeq: number
  pdfUrl: string
}

interface AskEntry {
  id: string
  selection: string
  answer: string | null
  error?: string
  loading?: boolean
}

const MIN_SELECTION = 15

export function ReadScreen({
  bookId,
  bookTitle,
  bookAuthor,
  chapterId,
  chapterTitle,
  chapterSeq,
  pdfUrl,
}: Props) {
  const [selection, setSelection] = useState('')
  const [asks, setAsks] = useState<AskEntry[]>([])
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Watch for text selection anywhere on the page. Only keep selections of
  // meaningful length, so clicks / drags over a word don't flicker the Ask
  // button on.
  useEffect(() => {
    function update() {
      const text = window.getSelection()?.toString().trim() ?? ''
      if (text.length >= MIN_SELECTION && text.length <= 2000) {
        setSelection(text)
      } else {
        setSelection('')
      }
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  async function ask() {
    if (!selection) return
    const entryId = crypto.randomUUID()
    const current = selection
    setAsks((a) => [
      { id: entryId, selection: current, answer: null, loading: true },
      ...a,
    ])
    // Clear the window selection so the Ask button hides until user
    // selects again.
    window.getSelection()?.removeAllRanges()
    setSelection('')

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId, selection: current }),
      })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Ask failed' }))
        setAsks((a) =>
          a.map((e) =>
            e.id === entryId
              ? { ...e, loading: false, error: apiError ?? 'Ask failed' }
              : e,
          ),
        )
        return
      }
      const { answer } = (await res.json()) as { answer: string }
      setAsks((a) =>
        a.map((e) =>
          e.id === entryId ? { ...e, loading: false, answer } : e,
        ),
      )
    } catch {
      setAsks((a) =>
        a.map((e) =>
          e.id === entryId
            ? { ...e, loading: false, error: 'Network error' }
            : e,
        ),
      )
    }
  }

  const selectionPreview = useMemo(() => {
    if (!selection) return null
    if (selection.length <= 80) return selection
    return selection.slice(0, 80) + '…'
  }, [selection])

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
        <Link
          href={`/b/${bookId}/map`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← map
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {bookAuthor ? `${bookAuthor} · ` : ''}
            {bookTitle}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            Chapter {chapterSeq + 1}: {chapterTitle}
          </p>
        </div>
        <Link
          href={`/b/${bookId}/brief/${chapterId}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40"
        >
          Switch to Brief →
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 gap-6 px-4 py-6 lg:px-8">
        {/* Left: PDF viewer */}
        <section className="min-w-0 flex-1">
          <PdfViewer url={pdfUrl} />
        </section>

        {/* Right: ask sidebar */}
        <aside
          ref={sidebarRef}
          className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border pl-4 lg:flex"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Highlight & Ask
            </h2>
            <p className="text-xs text-muted-foreground/80">
              Select a passage in the PDF, then press Ask. Answer shows below.
            </p>
          </div>

          {selection ? (
            <div className="flex flex-col gap-2 rounded-md border border-foreground/30 bg-muted/30 p-3">
              <p className="text-xs italic text-foreground">
                &ldquo;{selectionPreview}&rdquo;
              </p>
              <button
                type="button"
                onClick={ask}
                className="self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Ask about this →
              </button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No selection yet. Highlight ≥ {MIN_SELECTION} characters in the
              PDF to activate.
            </p>
          )}

          <div className="flex flex-col gap-4">
            {asks.map((a) => (
              <article
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
              >
                <p className="text-xs italic text-muted-foreground">
                  &ldquo;
                  {a.selection.length > 120
                    ? a.selection.slice(0, 120) + '…'
                    : a.selection}
                  &rdquo;
                </p>
                {a.loading && (
                  <p className="text-xs text-muted-foreground">Thinking…</p>
                )}
                {a.error && (
                  <p className="text-xs text-destructive">{a.error}</p>
                )}
                {a.answer && (
                  <p className="text-sm leading-relaxed text-foreground">
                    {a.answer}
                  </p>
                )}
              </article>
            ))}
          </div>
        </aside>
      </div>
    </main>
  )
}
