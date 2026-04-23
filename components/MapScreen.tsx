'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoginModal } from '@/components/LoginModal'
import type { MapVerdict } from '@/lib/ai/mapper'

interface ChapterSummary {
  id: string
  seq: number
  title: string
}

interface MapItem {
  chapterId: string
  verdict: MapVerdict
  reason: string
}

// Read mode (Screen 4A, PDF viewer) is Phase 10 — deferred. Map screen
// currently only offers "Brief" as the in-depth path. Keep the union so
// Phase 10 can restore 'read' without refactoring callers.
type Mode = 'brief'

interface Props {
  bookId: string
  chapters: ChapterSummary[]
  initialResults: MapItem[]
}

export function MapScreen({ bookId, chapters, initialResults }: Props) {
  const [results, setResults] = useState<MapItem[] | null>(
    initialResults.length > 0 ? initialResults : null,
  )
  const [loading, setLoading] = useState(initialResults.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pending, setPending] = useState<{ chapterId: string; mode: Mode } | null>(
    null,
  )

  useEffect(() => {
    if (initialResults.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/map', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bookId }),
        })
        if (!res.ok) {
          const { error: apiError } = await res
            .json()
            .catch(() => ({ error: 'Mapping failed' }))
          if (!cancelled) {
            setError(apiError ?? 'Mapping failed')
            setLoading(false)
          }
          return
        }
        const { results: r } = (await res.json()) as { results: MapItem[] }
        if (!cancelled) {
          setResults(r)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError('Network error. Refresh to try again.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, initialResults.length])

  const byId = new Map(chapters.map((c) => [c.id, c]))

  const worth: MapItem[] = []
  const skip: MapItem[] = []
  const unanswered: MapItem[] = []
  for (const r of results ?? []) {
    if (r.verdict === 'worth') worth.push(r)
    else if (r.verdict === 'skip') skip.push(r)
    else unanswered.push(r)
  }

  async function handleClick(chapterId: string, mode: Mode) {
    // Require auth to continue into Brief. If already signed-in, skip the
    // modal, claim any session books, and navigate.
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await fetch('/api/claim', { method: 'POST' }).catch(() => null)
      window.location.href = `/b/${bookId}/${mode}/${chapterId}`
      return
    }
    // Not signed in — open the modal. On return from OAuth the callback
    // route will auto-claim and redirect to the target page directly,
    // so no extra click required.
    setPending({ chapterId, mode })
    setModalOpen(true)
  }

  async function afterLogin() {
    // Email path: login succeeded in the modal; claim books, then navigate.
    // (OAuth path never reaches this callback — it redirects away.)
    await fetch('/api/claim', { method: 'POST' }).catch(() => null)
    if (pending) {
      window.location.href = `/b/${bookId}/${pending.mode}/${pending.chapterId}`
    } else {
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <div className="h-1 w-24 animate-pulse rounded bg-border" />
        Mapping chapters to your goal…
      </section>
    )
  }
  if (error) {
    return (
      <section className="flex flex-col gap-2 py-8 text-sm text-destructive">
        {error}
      </section>
    )
  }

  // If OAuth-return auth is required, go straight to the Brief page the
  // user clicked on — the callback route claims the book inline so Brief
  // can render without a detour through /map.
  const modalReturnTo = pending
    ? `/b/${bookId}/${pending.mode}/${pending.chapterId}`
    : `/b/${bookId}/map`

  return (
    <>
      <section className="flex flex-col gap-10">
        <Section
          label="✅ Worth reading for you"
          emptyText="No chapters matched."
          items={worth}
          byId={byId}
          onBrief={(id) => handleClick(id, 'brief')}
        />

        <CollapsibleSection label={`❌ Not for your goal — skip these (${skip.length})`}>
          <Section
            items={skip}
            byId={byId}
            onBrief={(id) => handleClick(id, 'brief')}
          />
        </CollapsibleSection>

        {unanswered.length > 0 && (
          <Section
            label="⚠️ Your goal — but this book may not answer it"
            items={unanswered}
            byId={byId}
            onBrief={(id) => handleClick(id, 'brief')}
          />
        )}
      </section>

      {modalOpen && (
        <LoginModal
          returnTo={modalReturnTo}
          onClose={() => setModalOpen(false)}
          onSuccess={afterLogin}
        />
      )}
    </>
  )
}

function Section({
  label,
  items,
  byId,
  emptyText,
  onBrief,
}: {
  label?: string
  items: MapItem[]
  byId: Map<string, ChapterSummary>
  emptyText?: string
  onBrief: (chapterId: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {label && (
        <h3 className="text-sm font-medium tracking-wide text-foreground/80">
          {label}
        </h3>
      )}
      {items.length === 0 && emptyText ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => {
            const ch = byId.get(r.chapterId)
            if (!ch) return null
            return (
              <li
                key={r.chapterId}
                className="flex flex-col gap-2 rounded-md border border-border bg-background p-4"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Chapter {ch.seq + 1}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {ch.title}
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {r.reason}
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onBrief(r.chapterId)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    Brief →
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CollapsibleSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? `▾ ${label}` : `▸ ${label}`}
      </button>
      {open && children}
    </div>
  )
}
