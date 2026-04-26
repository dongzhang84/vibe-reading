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

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Upload failed' }))
        setState({ kind: 'error', message: apiError ?? 'Upload failed' })
        return
      }
      const { bookId } = await res.json()
      // Middleware gates /b/[id] behind login → ?next= flow
      window.location.href = `/b/${bookId}`
    } catch {
      setState({ kind: 'error', message: 'Network error. Try again.' })
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
