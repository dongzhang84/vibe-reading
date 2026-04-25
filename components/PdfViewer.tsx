'use client'

import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Self-host the worker from /public so we don't need a CDN and the bundler
// (Turbopack) doesn't have to resolve it. The file is copied at build time
// from node_modules/pdfjs-dist/build/pdf.worker.min.mjs.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface Props {
  url: string
  width?: number
  initialPage?: number
}

export function PdfViewer({ url, width = 720, initialPage = 1 }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrolledOnceRef = useRef(false)

  // After pages render, scroll to initialPage. Only do this once per mount
  // so the user can scroll away freely afterwards.
  useEffect(() => {
    if (scrolledOnceRef.current) return
    if (numPages === 0) return
    if (initialPage <= 1) {
      scrolledOnceRef.current = true
      return
    }
    const target = containerRef.current?.querySelector(
      `[data-page-number="${initialPage}"]`,
    )
    if (target) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      scrolledOnceRef.current = true
    }
  }, [numPages, initialPage])

  return (
    <div
      ref={containerRef}
      className="pdf-viewer flex w-full flex-col items-center"
    >
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
            className="mb-4 border border-border bg-background shadow-sm"
          >
            <Page
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
            />
          </div>
        ))}
      </Document>
    </div>
  )
}
