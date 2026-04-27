'use client'

import { useEffect, useRef, useState } from 'react'
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
// Trim a bit so the page doesn't kiss the scroll-container's edges at scale=1.
const FIT_WIDTH_MARGIN = 24

export function PdfViewer({ url, initialPage = 1 }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const scrolledOnceRef = useRef(false)

  // Track the container's available width so "fit width" (scale=1) actually
  // fits whatever pane the viewer ends up in.
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

  // Scroll to initialPage once the document is loaded. Only on first mount,
  // so user scroll / zoom afterward isn't yanked back.
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

  const baseWidth = Math.max(
    300,
    (containerWidth ?? FALLBACK_WIDTH) - FIT_WIDTH_MARGIN,
  )
  const pageWidth = Math.round(baseWidth * scale)

  function zoomOut() {
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
  }
  function zoomIn() {
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
  }
  function fitWidth() {
    setScale(1)
  }

  return (
    <div ref={containerRef} className="flex w-full flex-col items-stretch">
      <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/85 px-3 py-2 backdrop-blur">
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            label="Zoom out"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE + 0.001}
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Fit width" onClick={fitWidth}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Zoom in"
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
            <div
              key={i}
              data-page-number={i + 1}
              className="mb-4 border border-border bg-card shadow-sm"
            >
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>
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
