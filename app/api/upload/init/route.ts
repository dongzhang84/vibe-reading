import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_BYTES = 50 * 1024 * 1024
const STORAGE_BUCKET = 'vr-docs'

/**
 * Phase 1 of the upload flow. Returns a Supabase signed upload URL the
 * client can PUT the PDF directly to, so the file never goes through a
 * Vercel function (which has a hard ~4.5MB request body limit on Hobby).
 *
 * The storagePath is scoped to the session cookie — `finalize` later
 * re-checks the prefix matches the same session, so a leaked path can't
 * be processed by another user.
 */
export async function POST(request: Request) {
  const sessionId = await getOrCreateSessionId()

  const body = (await request.json().catch(() => null)) as {
    filename?: unknown
    size?: unknown
  } | null
  if (
    !body ||
    typeof body.filename !== 'string' ||
    typeof body.size !== 'number'
  ) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  if (!body.filename.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'PDF only' }, { status: 400 })
  }
  if (!Number.isFinite(body.size) || body.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (body.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Max 50MB' }, { status: 400 })
  }

  const storagePath = `session/${sessionId}/${crypto.randomUUID()}.pdf`
  const db = createAdminClient()
  const { data, error } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath)
  if (error || !data) {
    console.error('signed upload URL failed', error)
    return NextResponse.json(
      { error: 'Could not start upload' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    storagePath,
    uploadUrl: data.signedUrl,
    token: data.token,
  })
}
