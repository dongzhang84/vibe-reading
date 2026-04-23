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

type Mode = 'read' | 'brief'

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
    // Require auth to continue into Read / Brief. Check current session;
    // if signed-in, skip modal and navigate.
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      // Claim any session books, then navigate.
      await fetch('/api/claim', { method: 'POST' }).catch(() => null)
      window.location.href = `/b/${bookId}/${mode}/${chapterId}`
      return
    }
    setPending({ chapterId, mode })
    setModalOpen(true)
  }

  async function afterLogin() {
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

  return (
    <>
      <section className="flex flex-col gap-10">
        <Section
          label="✅ Worth reading for you"
          emptyText="No chapters matched."
          items={worth}
          byId={byId}
          onRead={(id) => handleClick(id, 'read')}
          onBrief={(id) => handleClick(id, 'brief')}
        />

        <CollapsibleSection label={`❌ Not for your goal — skip these (${skip.length})`}>
          <Section
            items={skip}
            byId={byId}
            onRead={(id) => handleClick(id, 'read')}
            onBrief={(id) => handleClick(id, 'brief')}
          />
        </CollapsibleSection>

        {unanswered.length > 0 && (
          <Section
            label="⚠️ Your goal — but this book may not answer it"
            items={unanswered}
            byId={byId}
            onRead={(id) => handleClick(id, 'read')}
            onBrief={(id) => handleClick(id, 'brief')}
          />
        )}
      </section>

      {modalOpen && (
        <LoginModal
          returnTo={`/b/${bookId}/map`}
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
  onRead,
  onBrief,
}: {
  label?: string
  items: MapItem[]
  byId: Map<string, ChapterSummary>
  emptyText?: string
  onRead: (chapterId: string) => void
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
                    onClick={() => onRead(r.chapterId)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40"
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={() => onBrief(r.chapterId)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    Brief
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
