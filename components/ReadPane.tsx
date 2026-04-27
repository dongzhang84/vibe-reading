'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'

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
      <header className="border-b border-border bg-background/85 px-8 py-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-accent" />
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Read
          </p>
        </div>
        <h2 className="mt-2 text-balance text-xl font-semibold tracking-tight text-foreground">
          {chapterTitle}
        </h2>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-secondary/20 px-4 py-6">
          <PdfViewer url={pdfUrl} initialPage={pageStart} width={560} />
        </div>

        <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-5 lg:flex">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Highlight & Ask
            </h3>
          </div>

          {selection ? (
            <div className="flex flex-col gap-3 rounded-xl border border-foreground/30 bg-card p-4 shadow-sm">
              <p className="text-xs italic leading-relaxed text-foreground/80">
                &ldquo;{selectionPreview}&rdquo;
              </p>
              <button
                type="button"
                onClick={ask}
                className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Ask about this
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <p className="rounded-xl border-2 border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
              Highlight ≥ {MIN_SELECTION} characters in the PDF to ask about a
              passage.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {asks.map((a) => (
              <article
                key={a.id}
                className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4"
              >
                <p className="text-xs italic leading-relaxed text-muted-foreground">
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
