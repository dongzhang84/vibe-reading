'use client'

import { useRef, useState } from 'react'

const MAX_BYTES = 50 * 1024 * 1024

export function UploadDropzone() {
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    if (file.type !== 'application/pdf') {
      setState('error')
      setError('PDF only.')
      return
    }
    if (file.size > MAX_BYTES) {
      setState('error')
      setError('Max 50MB.')
      return
    }

    setState('uploading')
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const { error: apiError } = await res
          .json()
          .catch(() => ({ error: 'Upload failed' }))
        setState('error')
        setError(apiError ?? 'Upload failed')
        return
      }
      const { bookId } = await res.json()
      // v2: middleware will gate /b/[id] behind login if needed → ?next=/b/[id]
      window.location.href = `/b/${bookId}`
    } catch {
      setState('error')
      setError('Network error. Try again.')
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
      role="button"
      tabIndex={0}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-8 py-14 text-center transition-colors outline-none focus-visible:border-foreground ${
        isDragOver
          ? 'border-foreground bg-muted/40'
          : 'border-border hover:border-foreground/60'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {state === 'uploading' ? (
        <p className="text-sm text-foreground">Uploading…</p>
      ) : (
        <>
          <p className="text-sm text-foreground">
            Drop a PDF, or click to choose
          </p>
          <p className="text-xs text-muted-foreground">PDF · up to 50MB</p>
        </>
      )}

      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
