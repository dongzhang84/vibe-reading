'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'

const PdfViewer = dynamic(
  () => import('@/components/PdfViewer').then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <p className="py-8 text-sm text-muted-foreground">Loading viewer…</p>
    ),
  },
)

interface Props {
  bookId: string
  chapterId: string
  chapterTitle: string
  pdfUrl: string
  pageStart: number
}

interface AskEntry {
  id: string
  selection: string
  answer: string | null
  error?: string
  loading?: boolean
}

const MIN_SELECTION = 15

export function ReadPane({
  bookId,
  chapterId,
  chapterTitle,
  pdfUrl,
  pageStart,
}: Props) {
  const [selection, setSelection] = useState('')
  const [asks, setAsks] = useState<AskEntry[]>([])

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

  // Reset ask history when switching chapters.
  useEffect(() => {
    setAsks([])
    setSelection('')
  }, [chapterId])

  async function ask() {
    if (!selection) return
    const entryId = crypto.randomUUID()
    const current = selection
    setAsks((a) => [
      { id: entryId, selection: current, answer: null, loading: true },
      ...a,
    ])
    window.getSelection()?.removeAllRanges()
    setSelection('')

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, chapterId, selection: current }),
      })
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: 'Ask failed' }))
        setAsks((a) =>
          a.map((e) =>
            e.id === entryId
              ? { ...e, loading: false, error: error ?? 'Ask failed' }
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
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border bg-background/95 px-6 py-4 backdrop-blur">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Read
        </p>
        <h2 className="mt-1 text-lg font-medium text-foreground">
          {chapterTitle}
        </h2>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <PdfViewer url={pdfUrl} initialPage={pageStart} width={560} />
        </div>

        <aside className="hidden w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-muted/10 p-4 lg:flex">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Highlight & Ask
          </h3>
          {selection ? (
            <div className="flex flex-col gap-2 rounded-md border border-foreground/40 bg-background p-3">
              <p className="text-xs italic text-foreground/80">
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
              Highlight ≥ {MIN_SELECTION} chars in the PDF to ask about a passage.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {asks.map((a) => (
              <article
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
              >
                <p className="text-xs italic text-muted-foreground">
                  &ldquo;
                  {a.selection.length > 100
                    ? a.selection.slice(0, 100) + '…'
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
    </div>
  )
}
