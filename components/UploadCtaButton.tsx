'use client'

import { Upload } from 'lucide-react'

/**
 * The CTA section's "Upload Your Book" button. Triggers the file picker
 * on the dropzone above (id="vr-file-upload"). Lives in its own client
 * component because server components can't carry onClick handlers.
 */
export function UploadCtaButton() {
  return (
    <button
      type="button"
      onClick={() => document.getElementById('vr-file-upload')?.click()}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Upload className="h-4 w-4" />
      Upload Your Book
    </button>
  )
}
