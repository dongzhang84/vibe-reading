'use client'

import { useEffect, useState } from 'react'
import type { Brief } from '@/lib/ai/briefer'

interface Props {
  bookId: string
  chapterId: string
  initialBrief: Brief | null
}

export function BriefScreen({ bookId, chapterId, initialBrief }: Props) {
  const [brief, setBrief] = useState<Brief | null>(initialBrief)
  const [loading, setLoading] = useState(initialBrief === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialBrief) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/brief', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bookId, chapterId }),
        })
        if (!res.ok) {
          const { error: apiError } = await res
            .json()
            .catch(() => ({ error: 'Brief failed' }))
          if (!cancelled) {
            setError(apiError ?? 'Brief failed')
            setLoading(false)
          }
          return
        }
        const { brief: b } = (await res.json()) as { brief: Brief }
        if (!cancelled) {
          setBrief(b)
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
  }, [bookId, chapterId, initialBrief])

  if (loading) {
    return (
      <section className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
        <div className="h-1 w-24 animate-pulse rounded bg-border" />
        Writing the 4-part brief…
      </section>
    )
  }
  if (error || !brief) {
    return (
      <section className="flex flex-col gap-2 py-8 text-sm text-destructive">
        {error ?? 'Brief unavailable'}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-10">
      <BriefSection label="The one sentence version:">
        <p className="text-base leading-relaxed text-foreground">
          {brief.one_sentence}
        </p>
      </BriefSection>

      <BriefSection label="The 3 key claims:">
        <ol className="flex list-decimal flex-col gap-3 pl-6 text-base leading-relaxed text-foreground">
          {brief.key_claims.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </BriefSection>

      <BriefSection label="One example the author uses:">
        <p className="text-base leading-relaxed text-foreground">
          {brief.example}
        </p>
      </BriefSection>

      <BriefSection label="What the author does NOT address:">
        <p className="text-base leading-relaxed text-foreground">
          {brief.not_addressed}
        </p>
      </BriefSection>
    </section>
  )
}

function BriefSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  )
}
