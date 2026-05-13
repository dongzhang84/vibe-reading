'use client'

import { useEffect, useState } from 'react'

interface Props {
  chapterId: string
  /**
   * Multiplier applied to all prose font sizes via the --prose-scale CSS
   * variable. 1.0 = default; valid range is whatever the FontSizeToggle
   * exposes (currently 0.9 / 1.0 / 1.15 / 1.3).
   */
  fontScale?: number
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; html: string }
  | { kind: 'empty' } // chapter exists but content_html is null (legacy PDF row)
  | { kind: 'error'; message: string }

/**
 * Renders the sanitized HTML body of an EPUB chapter inside a `prose`
 * block. The HTML is already sanitized server-side by lib/epub/sanitize
 * (allowlisted tags, no scripts/styles/event handlers, no js: URLs),
 * so dangerouslySetInnerHTML here is safe in v1. If we ever start
 * accepting user-edited chapter HTML, run it through DOMPurify before
 * this component.
 */
export function EpubChapterView({ chapterId, fontScale = 1 }: Props) {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/chapter/${chapterId}/html`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<{ contentHtml: string | null }>
      })
      .then(({ contentHtml }) => {
        if (cancelled) return
        if (!contentHtml) {
          setState({ kind: 'empty' })
          return
        }
        setState({ kind: 'ready', html: contentHtml })
      })
      .catch((err) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load chapter',
        })
      })
    return () => {
      cancelled = true
    }
  }, [chapterId])

  if (state.kind === 'loading') {
    return (
      <p className="py-8 text-sm text-muted-foreground">Loading chapter…</p>
    )
  }
  if (state.kind === 'error') {
    return (
      <p className="py-8 text-sm text-destructive">
        Couldn’t load this chapter: {state.message}
      </p>
    )
  }
  if (state.kind === 'empty') {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        This chapter has no readable text content.
      </p>
    )
  }

  return (
    // All the heading / paragraph / list typography for `.prose` is in
    // app/globals.css. Tailwind v4 + @tailwindcss/typography + shadcn's
    // reset interacted poorly with prose-X:utility modifiers here, so
    // we use plain CSS rules scoped to `.prose` instead. Keep this
    // className minimal — anything visual lives in globals.css.
    <article
      className="prose prose-slate mx-auto max-w-prose py-8 dark:prose-invert"
      style={{ ['--prose-scale' as string]: fontScale }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}
