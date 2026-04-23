import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { claimSessionBooks } from '@/lib/auth/claim'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/library'
  // Only allow same-origin relative paths for next — prevent open redirect.
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/library'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`)
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`)
  }

  // If the visitor had a session cookie with unclaimed books, migrate them
  // to this user right now — so the next page they hit already shows the
  // book as theirs and doesn't need a separate round trip to /api/claim.
  const sessionId = await getSessionId()
  if (sessionId) {
    try {
      await claimSessionBooks({ userId: data.user.id, sessionId })
    } catch (err) {
      console.error('inline claim failed', err)
      // Non-fatal — MapScreen still calls /api/claim defensively.
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
