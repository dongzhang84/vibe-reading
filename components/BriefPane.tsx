'use client'

import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import type { Brief } from '@/lib/ai/briefer'

interface Props {
  bookId: string
  chapterId: string
  chapterTitle: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; brief: Brief }

export function BriefPane({
  bookId,
  chapterId,
  chapterTitle,
}: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch('/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId, chapterId }),
    })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const { error } = await res
            .json()
            .catch(() => ({ error: 'Brief failed' }))
          setState({ kind: 'error', message: error ?? 'Brief failed' })
          return
        }
        const { brief } = (await res.json()) as { brief: Brief }
        setState({ kind: 'ready', brief })
      })
      .catch(() => {
        if (cancelled) return
        setState({ kind: 'error', message: 'Network error' })
      })
    return () => {
      cancelled = true
    }
  }, [bookId, chapterId])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-8 py-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-accent" />
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Brief
          </p>
        </div>
        <h2 className="mt-2 text-balance text-xl font-semibold tracking-tight text-foreground">
          {chapterTitle}
        </h2>
      </header>

      <div className="flex flex-col gap-10 px-8 py-8">
        {state.kind === 'loading' && (
          <p className="text-sm text-muted-foreground">Reading the chapter…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        {state.kind === 'ready' && <BriefBody brief={state.brief} />}
      </div>
    </div>
  )
}

function BriefBody({ brief }: { brief: Brief }) {
  return (
    <>
      <Section label="The one-sentence version">
        <p className="text-pretty text-lg leading-relaxed text-foreground">
          {brief.one_sentence}
        </p>
      </Section>
      <Section label="The 3 key claims">
        <ol className="flex flex-col gap-3">
          {brief.key_claims.map((c, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section label="One example the author uses">
        <p className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
          {brief.example}
        </p>
      </Section>
      <Section label="What the author does NOT address">
        <p className="text-sm leading-relaxed text-foreground/85">
          {brief.not_addressed}
        </p>
      </Section>
    </>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}
