'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BookOpen, MoreVertical, Trash2 } from 'lucide-react'

interface Book {
  id: string
  title: string
  author: string | null
  page_count: number | null
  created_at: string | null
  lastAsked: string | null
}

interface Props {
  books: Book[]
}

export function LibraryList({ books: initialBooks }: Props) {
  const [books, setBooks] = useState(initialBooks)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Close menu on Escape key.
  useEffect(() => {
    if (!openMenu) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openMenu])

  async function deleteBook(id: string, title: string) {
    setOpenMenu(null)
    const ok = window.confirm(
      `Delete "${title}"?\n\nQuestions, briefs, and the PDF will be removed. This cannot be undone.`,
    )
    if (!ok) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: 'Delete failed' }))
        alert(error ?? 'Delete failed')
        setDeleting(null)
        return
      }
      setBooks((prev) => prev.filter((b) => b.id !== id))
      setDeleting(null)
    } catch {
      alert('Network error.')
      setDeleting(null)
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {books.map((b) => {
        const isMenuOpen = openMenu === b.id
        const isDeleting = deleting === b.id
        return (
          <li
            key={b.id}
            className={`group relative rounded-xl border border-border bg-card transition-colors ${
              isDeleting ? 'opacity-50' : 'hover:bg-secondary/50'
            }`}
          >
            <Link
              href={`/b/${b.id}`}
              className="flex items-start gap-4 p-5 pr-12"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-foreground/5">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium text-foreground">{b.title}</p>
                {b.author && (
                  <p className="text-sm text-muted-foreground">{b.author}</p>
                )}
                {b.lastAsked && (
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    Last asked:{' '}
                    <span className="italic text-foreground/75">
                      &ldquo;{b.lastAsked}&rdquo;
                    </span>
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {b.page_count ? `${b.page_count} pages · ` : ''}
                  added {formatDate(b.created_at)}
                </p>
              </div>
            </Link>

            <div className="absolute right-3 top-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpenMenu(isMenuOpen ? null : b.id)
                }}
                disabled={isDeleting}
                aria-label="Open book menu"
                aria-expanded={isMenuOpen}
                className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOpenMenu(null)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 flex min-w-[140px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-md">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        deleteBook(b.id, b.title)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete book
                    </button>
                  </div>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function formatDate(v: string | null): string {
  if (!v) return ''
  try {
    const d = new Date(v)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}
