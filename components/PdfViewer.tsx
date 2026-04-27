'use client'

import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Maximize2, Minus, Plus } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Self-host the worker from /public so we don't need a CDN and the bundler
// (Turbopack) doesn't have to resolve it. The file is copied at build time
// from node_modules/pdfjs-dist/build/pdf.worker.min.mjs.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface Props {
  url: string
  initialPage?: number
}

const MIN_SCALE = 0.5
const MAX_SCALE = 3.0
const SCALE_STEP = 0.1
const FALLBACK_WIDTH = 720
const FIT_WIDTH_MARGIN = 24
// Letter (8.5×11) ≈ 0.773 — close enough for most non-fiction PDFs.
const PAGE_ASPECT_RATIO = 0.773
const PRELOAD_MARGIN = '800px 0px'

export function PdfViewer({ url, initialPage = 1 }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [pageInput, setPageInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const scrolledOnceRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setContainerWidth(w)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (scrolledOnceRef.current) return
    if (numPages === 0) return
    if (initialPage <= 1) {
      scrolledOnceRef.current = true
      return
    }
    const target = pagesRef.current?.querySelector(
      `[data-page-number="${initialPage}"]`,
    )
    if (target) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      scrolledOnceRef.current = true
    }
  }, [numPages, initialPage])

  // Keyboard shortcuts: + / = zoom in, - / _ zoom out, 0 fit width,
  // g focus the page-jump input. Disabled when the user is typing in any
  // input/textarea/contenteditable, and disabled when a modifier key is held
  // (so Cmd+0, Ctrl+- etc. fall through to the browser).
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        fitWidth()
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        const input = pageInputRef.current
        if (input) {
          input.focus()
          input.select()
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  const baseWidth = Math.max(
    300,
    (containerWidth ?? FALLBACK_WIDTH) - FIT_WIDTH_MARGIN,
  )
  const pageWidth = Math.round(baseWidth * scale)
  const deferredPageWidth = useDeferredValue(pageWidth)

  function zoomOut() {
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
  }
  function zoomIn() {
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
  }
  function fitWidth() {
    setScale(1)
  }

  function jumpToPage(e: FormEvent) {
    e.preventDefault()
    const n = parseInt(pageInput, 10)
    if (Number.isNaN(n) || n < 1 || n > numPages) return
    const target = pagesRef.current?.querySelector(
      `[data-page-number="${n}"]`,
    )
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPageInput('')
      pageInputRef.current?.blur()
    }
  }

  return (
    <div ref={containerRef} className="flex w-full flex-col items-stretch">
      <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/85 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <form
            onSubmit={jumpToPage}
            className="flex items-center gap-1.5"
            title="Go to page (g)"
          >
            <input
              ref={pageInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={numPages || undefined}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setPageInput('')
                  pageInputRef.current?.blur()
                }
              }}
              placeholder="Page"
              disabled={numPages === 0}
              className="w-16 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground outline-none transition-colors focus:border-foreground/40 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              / {numPages || '—'}
            </span>
          </form>
        </div>
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            label="Zoom out (−)"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE + 0.001}
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Fit width (0)" onClick={fitWidth}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Zoom in (+)"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE - 0.001}
          >
            <Plus className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      <div ref={pagesRef} className="flex flex-col items-center">
        <Document
          file={url}
          onLoadSuccess={(doc) => {
            setNumPages(doc.numPages)
            setError(null)
          }}
          onLoadError={(err) => {
            console.error('PDF load error', err)
            setError('Could not load PDF. Try refresh.')
          }}
          loading={
            <p className="py-8 text-sm text-muted-foreground">Loading PDF…</p>
          }
          error={
            <p className="py-8 text-sm text-destructive">
              {error ?? 'Could not load PDF.'}
            </p>
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <PageSlot
              key={i}
              pageNumber={i + 1}
              width={deferredPageWidth}
            />
          ))}
        </Document>
      </div>
    </div>
  )
}

function PageSlot({
  pageNumber,
  width,
}: {
  pageNumber: number
  width: number
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = slotRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  const reservedHeight = Math.round(width / PAGE_ASPECT_RATIO)
  const placeholderStyle = { width, minHeight: reservedHeight }

  return (
    <div
      ref={slotRef}
      data-page-number={pageNumber}
      className="mb-4 flex items-center justify-center overflow-hidden border border-border bg-card shadow-sm"
      style={placeholderStyle}
    >
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          renderAnnotationLayer={false}
          loading={
            <div
              className="flex items-center justify-center text-xs text-muted-foreground"
              style={placeholderStyle}
            >
              Loading page {pageNumber}…
            </div>
          }
        />
      ) : (
        <span className="text-xs text-muted-foreground">
          Page {pageNumber}
        </span>
      )}
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  )
}
