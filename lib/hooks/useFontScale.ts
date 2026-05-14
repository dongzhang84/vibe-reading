'use client'

import { useCallback, useEffect, useState } from 'react'

// Four discrete sizes: small / default / large / extra-large. Wider range
// would only invite analysis paralysis. The numbers feed directly into
// `--prose-scale` in app/globals.css via the EpubChapterView's inline style.
export const SCALES = [0.9, 1.0, 1.15, 1.3] as const
export type Scale = (typeof SCALES)[number]

const DEFAULT_SCALE: Scale = 1.0
const STORAGE_KEY = 'vr-epub-font-scale'

function isScale(n: number): n is Scale {
  return (SCALES as readonly number[]).includes(n)
}

export interface UseFontScaleReturn {
  scale: Scale
  shrink: () => void
  grow: () => void
  canShrink: boolean
  canGrow: boolean
}

/**
 * Manages the EPUB Read-pane font-scale preference. Persisted in
 * localStorage so the choice survives chapter navigation, page reload,
 * and tab close.
 *
 * Starts at DEFAULT_SCALE on the server / first client render to avoid
 * hydration mismatch; reads from localStorage in a post-mount effect.
 */
export function useFontScale(): UseFontScaleReturn {
  const [scale, setScale] = useState<Scale>(DEFAULT_SCALE)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = parseFloat(raw)
      if (Number.isFinite(parsed) && isScale(parsed)) setScale(parsed)
    } catch {
      // localStorage can throw in private mode / locked-down browsers — fail open.
    }
  }, [])

  const persist = useCallback((next: Scale) => {
    setScale(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
  }, [])

  const index = SCALES.indexOf(scale)
  const canShrink = index > 0
  const canGrow = index < SCALES.length - 1

  const shrink = useCallback(() => {
    if (index > 0) persist(SCALES[index - 1])
  }, [index, persist])

  const grow = useCallback(() => {
    if (index < SCALES.length - 1) persist(SCALES[index + 1])
  }, [index, persist])

  return { scale, shrink, grow, canShrink, canGrow }
}
