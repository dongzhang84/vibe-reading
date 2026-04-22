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
      setError('PDF only. This tool reads books, not images or notes.')
      return
    }
    if (file.size > MAX_BYTES) {
      setState('error')
      setError('Max 50MB. Trim the PDF or try a smaller book.')
      return
    }

    setState('uploading')
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const { error: apiError } = await res.json().catch(() => ({ error: 'Upload failed' }))
        setState('error')
        setError(apiError ?? 'Upload failed')
        return
      }
      const { bookId } = await res.json()
      window.location.href = `/b/${bookId}/goal`
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
      className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-8 py-16 text-center transition-colors ${
        isDragOver
          ? 'border-black bg-black/5 dark:border-white dark:bg-white/10'
          : 'border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
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
        <p className="text-base text-zinc-700 dark:text-zinc-300">Uploading…</p>
      ) : (
        <>
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            Drop a PDF here, or click to choose
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            PDF only · up to 50MB
          </p>
        </>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
