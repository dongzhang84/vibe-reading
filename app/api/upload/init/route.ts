import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndIncrement, quotaErrorMessage } from '@/lib/usage/quota'

// NOTE on quota for upload: getOrCreateSessionId binds the upload to a
// session cookie which may pre-date login (the design lets users drop a
// PDF before signing in). Quota is keyed on auth user_id, which only
// exists after sign-in. So we apply the cap only when the request is
// authenticated. Anonymous upload abuse (curl-bombing /api/upload/init
// without signing in) is a known gap, mitigated for now by the OpenAI
// dashboard monthly hard cap. See docs/todo.md bucket B.

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

  // Conditional quota: only logged-in callers go through the bucket.
  // See top-of-file note on the anonymous-upload gap.
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const quota = await checkAndIncrement(user.id, 'upload')
    if (!quota.allowed) {
      return NextResponse.json(
        { error: quotaErrorMessage('upload', quota.cap) },
        { status: 429 },
      )
    }
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
