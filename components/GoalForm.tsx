'use client'

import { useState } from 'react'

const EXAMPLES = [
  'I want to understand how the author defines [X]',
  "I'm working on [Y] project — I want to see if there's a relevant method",
  "I keep hearing this book quoted — I want to know if I should actually read it",
  "I want to compare this author's view on [Z] with what I already believe",
  'I have to discuss this book in a meeting next week — I need the gist',
]

interface Props {
  bookId: string
  initialText?: string
}

export function GoalForm({ bookId, initialText = '' }: Props) {
  const [text, setText] = useState(initialText)
  const [showExamples, setShowExamples] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = text.trim().length < 10

  async function submit() {
    if (tooShort || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/goal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, text: text.trim() }),
      })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Could not save goal' }))
        setError(apiError ?? 'Could not save goal')
        setSubmitting(false)
        return
      }
      window.location.href = `/b/${bookId}/map`
    } catch {
      setError('Network error. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Say what you actually want from this book."
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-base leading-relaxed outline-none focus:border-foreground"
      />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowExamples((v) => !v)}
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          {showExamples ? 'Hide examples ↑' : 'Not sure what to write? See examples ↓'}
        </button>
        {showExamples && (
          <ul className="flex flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
            {EXAMPLES.map((ex, i) => (
              <li key={i} className="list-disc">
                {ex}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={tooShort || submitting}
        className="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Continue →'}
      </button>
    </section>
  )
}
