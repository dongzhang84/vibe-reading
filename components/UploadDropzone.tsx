'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MAX_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'vr-docs'

type Phase = 'starting' | 'transferring' | 'analyzing'

type State =
  | { kind: 'idle' }
  | {
      kind: 'uploading'
      file: File
      phase: Phase
      phaseStartedAt: number
    }
  | { kind: 'error'; message: string }

export function UploadDropzone() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [isDragging, setIsDragging] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Tick `now` once a second while uploading so the elapsed-seconds counter
  // and the cycling phase label below update on time.
  useEffect(() => {
    if (state.kind !== 'uploading') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state.kind])

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setState({ kind: 'error', message: 'PDF only.' })
      return
    }
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', message: 'Max 50MB.' })
      return
    }

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
    const startedAt = Date.now()
    const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(1)

    const reportFailure = async (
      label: string,
      res: Response,
    ): Promise<void> => {
      const contentType =
        res.headers.get('content-type') ?? '(no content-type)'
      let bodyText = ''
      try {
        bodyText = await res.text()
      } catch {
        bodyText = '(failed to read body)'
      }
      let appError: string | null = null
      if (contentType.includes('application/json')) {
        try {
          appError =
            (JSON.parse(bodyText) as { error?: string }).error ?? null
        } catch {
          /* fall through to raw diagnostics */
        }
      }
      const diag = `${label} · HTTP ${res.status} ${res.statusText} · ${sizeMB}MB · ${elapsed()}s · ${contentType} · ${bodyText.slice(0, 240).replace(/\s+/g, ' ').trim()}`
      // eslint-disable-next-line no-console
      console.error(`[upload] ${label} failed`, {
        status: res.status,
        statusText: res.statusText,
        contentType,
        elapsedSec: elapsed(),
        sizeMB,
        bodySnippet: bodyText.slice(0, 1000),
      })
      setState({ kind: 'error', message: appError ?? diag })
    }

    setState({
      kind: 'uploading',
      file,
      phase: 'starting',
      phaseStartedAt: Date.now(),
    })

    // Phase 1 — ask server for a signed upload URL bound to this session.
    let initRes: Response
    try {
      initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setState({
        kind: 'error',
        message: `Network error · ${sizeMB}MB · ${elapsed()}s · ${reason}`,
      })
      return
    }
    if (!initRes.ok) {
      await reportFailure('init', initRes)
      return
    }
    const { storagePath, token } = (await initRes.json()) as {
      storagePath: string
      uploadUrl: string
      token: string
    }

    // Phase 2 — client uploads the PDF directly to Supabase Storage,
    // bypassing Vercel's function payload limit entirely.
    setState({
      kind: 'uploading',
      file,
      phase: 'transferring',
      phaseStartedAt: Date.now(),
    })
    const supabase = createClient()
    const { error: putErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .uploadToSignedUrl(storagePath, token, file, {
        contentType: 'application/pdf',
      })
    if (putErr) {
      // eslint-disable-next-line no-console
      console.error('[upload] storage PUT failed', putErr)
      setState({
        kind: 'error',
        message: `Storage upload failed · ${sizeMB}MB · ${elapsed()}s · ${putErr.message}`,
      })
      return
    }

    // Phase 3 — server pulls the file back, parses, runs intake AI, writes
    // book + chapters rows.
    setState({
      kind: 'uploading',
      file,
      phase: 'analyzing',
      phaseStartedAt: Date.now(),
    })
    let finalizeRes: Response
    try {
      finalizeRes = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storagePath, filename: file.name }),
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setState({
        kind: 'error',
        message: `Network error · ${sizeMB}MB · ${elapsed()}s · ${reason}`,
      })
      return
    }
    if (!finalizeRes.ok) {
      await reportFailure('finalize', finalizeRes)
      return
    }
    const { bookId } = (await finalizeRes.json()) as { bookId: string }
    // Middleware gates /b/[id] behind login → ?next= flow
    window.location.href = `/b/${bookId}`
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

  // Phase label cycles inside `analyzing` based on elapsed seconds — the
  // server pipeline is opaque (single fetch), so we sync the wording to
  // its actual order: outline parse → chapter slice → intake AI. Even
  // without server events, the perceived progress matches reality.
  const phaseElapsedSec =
    state.kind === 'uploading'
      ? Math.max(0, Math.floor((now - state.phaseStartedAt) / 1000))
      : 0

  const phaseLabel = (() => {
    if (state.kind !== 'uploading') return ''
    if (state.phase === 'starting') return 'Preparing upload…'
    if (state.phase === 'transferring') return 'Uploading to storage…'
    // analyzing
    if (phaseElapsedSec < 4) return 'Reading the book outline…'
    if (phaseElapsedSec < 10) return 'Mapping chapter boundaries…'
    if (phaseElapsedSec < 20) return 'Drafting your starter questions…'
    return 'Almost done…'
  })()

  const showElapsed =
    state.kind === 'uploading' &&
    (state.phase !== 'starting' || phaseElapsedSec >= 1)

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
              <FileText className="h-6 w-6 animate-pulse text-accent" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">{state.file.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(state.file.size / (1024 * 1024)).toFixed(2)} MB · {phaseLabel}
                {showElapsed && (
                  <span className="ml-1 tabular-nums text-muted-foreground/60">
                    ({phaseElapsedSec}s)
                  </span>
                )}
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
