'use client'

import dynamic from 'next/dynamic'
import { Upload } from 'lucide-react'

/**
 * Lazy-load the real UploadDropzone so its supabase-js dependency stays
 * out of the landing page's initial JS bundle. The supabase client is
 * needed for `uploadToSignedUrl()` — but only at the moment a file is
 * actually dropped, not when the user lands on the page. Saves
 * ~150-200 KB off initial JS so hero / philosophy / features paint
 * faster.
 *
 * The skeleton mirrors the idle dropzone's geometry exactly so swapping
 * in the real component causes zero layout shift.
 */
function DropzoneSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="group relative flex min-h-[220px] w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
          <Upload className="h-6 w-6 text-muted-foreground" />
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
    </div>
  )
}

export const UploadDropzone = dynamic(
  () =>
    import('./UploadDropzone').then((m) => ({ default: m.UploadDropzone })),
  {
    ssr: false,
    loading: () => <DropzoneSkeleton />,
  },
)
