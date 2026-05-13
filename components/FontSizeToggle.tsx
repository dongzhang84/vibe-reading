'use client'

interface Props {
  onShrink: () => void
  onGrow: () => void
  canShrink: boolean
  canGrow: boolean
}

/**
 * Small "A | A" pill for stepping the EPUB Read-pane font scale. Left
 * button shrinks, right grows. Disabled at boundaries so the user knows
 * the limit instead of clicking into the void.
 */
export function FontSizeToggle({
  onShrink,
  onGrow,
  canShrink,
  canGrow,
}: Props) {
  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded-full border border-border bg-secondary/40"
      role="group"
      aria-label="Reading font size"
    >
      <button
        type="button"
        onClick={onShrink}
        disabled={!canShrink}
        aria-label="Decrease reading font size"
        className="flex items-center justify-center px-3 text-xs leading-none transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
      >
        A
      </button>
      <div aria-hidden className="my-2 w-px bg-border" />
      <button
        type="button"
        onClick={onGrow}
        disabled={!canGrow}
        aria-label="Increase reading font size"
        className="flex items-center justify-center px-3 text-base font-medium leading-none transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
      >
        A
      </button>
    </div>
  )
}
