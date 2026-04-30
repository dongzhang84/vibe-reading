'use client'

import { useCallback, useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'

const MAX_BYTES = 50 * 1024 * 1024

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; file: File }
  | { kind: 'error'; message: string }

export function UploadDropzone() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setState({ kind: 'error', message: 'PDF only.' })
      return
    }
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', message: 'Max 50MB.' })
      return
    }

    setState({ kind: 'uploading', file })
    const form = new FormData()
    form.append('file', file)

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
    const startedAt = Date.now()
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
      if (!res.ok) {
        const contentType =
          res.headers.get('content-type') ?? '(no content-type)'
        let bodyText = ''
        try {
          bodyText = await res.text()
        } catch {
          bodyText = '(failed to read body)'
        }
        // App-level JSON errors stay clean. Otherwise we surface raw
        // diagnostics: status code + elapsed time + response shape, so
        // platform-level failures (413 / 504 / edge rejections) don't
        // disappear behind "Upload failed".
        let appError: string | null = null
        if (contentType.includes('application/json')) {
          try {
            appError = (JSON.parse(bodyText) as { error?: string }).error ?? null
          } catch {
            /* fall through to raw diagnostics */
          }
        }
        const diag = `HTTP ${res.status} ${res.statusText} · ${sizeMB}MB · ${elapsedSec}s · ${contentType} · ${bodyText.slice(0, 240).replace(/\s+/g, ' ').trim()}`
        // eslint-disable-next-line no-console
        console.error('[upload] failed', {
          status: res.status,
          statusText: res.statusText,
          contentType,
          elapsedSec,
          sizeMB,
          bodySnippet: bodyText.slice(0, 1000),
        })
        setState({
          kind: 'error',
          message: appError ?? diag,
        })
        return
      }
      const { bookId } = await res.json()
      // Middleware gates /b/[id] behind login → ?next= flow
      window.location.href = `/b/${bookId}`
    } catch (err) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
      const reason = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.error('[upload] network error', { elapsedSec, sizeMB, reason })
      setState({
        kind: 'error',
        message: `Network error · ${sizeMB}MB · ${elapsedSec}s · ${reason}`,
      })
    }
  }, [])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) handleFile(selected)
  }

  const isUploading = state.kind === 'uploading'
  const hasError = state.kind === 'error'

  return (
    <div className="mx-auto w-full max-w-xl">
      <label
        htmlFor="vr-file-upload"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group relative flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 ${
          isDragging
            ? 'scale-[1.02] border-foreground bg-secondary'
            : isUploading
              ? 'border-accent bg-accent/5'
              : hasError
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border hover:border-foreground/30 hover:bg-secondary/50'
        }`}
      >
        <input
          ref={inputRef}
          id="vr-file-upload"
          type="file"
          accept="application/pdf"
          onChange={onChange}
          disabled={isUploading}
          className="sr-only"
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
              <FileText className="h-6 w-6 text-accent" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">{state.file.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(state.file.size / (1024 * 1024)).toFixed(2)} MB · Analyzing
                your book…
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-6">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
                isDragging
                  ? 'bg-foreground/10'
                  : 'bg-secondary group-hover:bg-foreground/5'
              }`}
            >
              <Upload
                className={`h-6 w-6 transition-colors ${
                  isDragging
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground'
                }`}
              />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">
                Drop a PDF, or click to choose
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                PDF · up to 50MB
              </p>
            </div>
          </div>
        )}
      </label>

      {hasError && (
        <p className="mt-3 text-center text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  )
}
