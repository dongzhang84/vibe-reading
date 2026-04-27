'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'vr-theme'

type Theme = 'light' | 'dark'

/**
 * Sun/moon toggle in the global Nav. The actual class flip is done by an
 * inline script in app/layout.tsx that runs BEFORE React hydrates, so the
 * page never flashes the wrong theme on load. This component just keeps
 * React state in sync and writes user choice to localStorage.
 */
export function ThemeToggle() {
  // null on first render (server) so we don't ship a wrong icon.
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    const root = document.documentElement
    if (next === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage — fall back to memory only.
    }
  }

  // First render: keep button shape (so layout doesn't jump) but no icon.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : theme === 'light' ? (
        <Moon className="h-4 w-4" />
      ) : null}
    </button>
  )
}
