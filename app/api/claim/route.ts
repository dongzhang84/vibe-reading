import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSessionId } from '@/lib/session'
import { claimSessionBooks } from '@/lib/auth/claim'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionId = await getSessionId()
  if (!sessionId) {
    return NextResponse.json({ claimed: 0 })
  }

  const result = await claimSessionBooks({ userId: user.id, sessionId })
  return NextResponse.json(result)
}
