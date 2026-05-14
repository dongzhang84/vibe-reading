'use client'

import { useEffect, useState } from 'react'

interface Props {
  bookId: string
  /** The chapter to scroll to on mount / when this prop changes. */
  chapterId: string
  /**
   * Multiplier applied to all prose font sizes via the --prose-scale CSS
   * variable. 1.0 = default; valid range is whatever the FontSizeToggle
   * exposes (currently 0.9 / 1.0 / 1.15 / 1.3).
   */
  fontScale?: number
}

interface ChapterPayload {
  id: string
  seq: number
  title: string
  contentHtml: string | null
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; chapters: ChapterPayload[] }
  | { kind: 'error'; message: string }

/**
 * Renders the full EPUB book as a continuous-scroll prose view. Mirrors
 * the PDF flow's "Read" semantics: clicking a chapter positions you at
 * its start but the rest of the book remains scrollable below — you
 * don't lose context at chapter boundaries.
 *
 * Each chapter is wrapped in `<section data-chapter-id={id} id="ch-{id}">`
 * so the "Highlight & Ask" feature can detect which chapter the user's
 * selection is in (walks up the DOM from the selection start to the
 * nearest data-chapter-id). PDF flow uses props.chapterId; EPUB flow
 * uses the live selection-derived id.
 *
 * Sanitized server-side by lib/epub/sanitize — allowlisted tags only,
 * no scripts / styles / event handlers / js: URLs — so
 * dangerouslySetInnerHTML is safe here. If we ever accept user-edited
 * chapter HTML, run it through DOMPurify before this component.
 */
export function EpubChapterView({ bookId, chapterId, fontScale = 1 }: Props) {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })

  // Fetch the whole book once per bookId. Switching chapters within the
  // same book is a scroll, not a re-fetch — but ReadPane currently keys
  // remount on chapterId, so in practice this still fetches per chapter
  // click. Browser cache (60s) absorbs the cost.
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/books/${bookId}/chapters-html`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<{ chapters: ChapterPayload[] }>
      })
      .then(({ chapters }) => {
        if (cancelled) return
        // Drop chapters without HTML (legacy PDF rows in a mixed-format
        // book shouldn't happen, but defend anyway). EPUB-only books
        // should never have null content_html post-finalize.
        const usable = chapters.filter(
          (c) => c.contentHtml && c.contentHtml.length > 0,
        )
        setState({ kind: 'ready', chapters: usable })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to load chapters',
        })
      })
    return () => {
      cancelled = true
    }
  }, [bookId])

  // Scroll to the requested chapter whenever it changes or data first
  // arrives. Wrap in rAF so the chapter sections have laid out before
  // we measure their position.
  useEffect(() => {
    if (state.kind !== 'ready') return
    const target = document.getElementById(`ch-${chapterId}`)
    if (!target) return
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
  }, [state.kind, chapterId])

  if (state.kind === 'loading') {
    return (
      <p className="py-8 text-sm text-muted-foreground">Loading book…</p>
    )
  }
  if (state.kind === 'error') {
    return (
      <p className="py-8 text-sm text-destructive">
        Couldn’t load this book: {state.message}
      </p>
    )
  }

  return (
    // All the heading / paragraph / list typography for `.prose` is in
    // app/globals.css. Keep this className minimal — anything visual
    // lives in globals.css.
    <div
      className="prose prose-slate mx-auto max-w-prose py-8 dark:prose-invert"
      style={{ ['--prose-scale' as string]: fontScale }}
    >
      {state.chapters.map((c, i) => (
        <section
          key={c.id}
          id={`ch-${c.id}`}
          data-chapter-id={c.id}
          className={
            i > 0
              ? 'mt-16 border-t border-foreground/10 pt-12 scroll-mt-4'
              : 'scroll-mt-4'
          }
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: c.contentHtml ?? '' }}
        />
      ))}
    </div>
  )
}
