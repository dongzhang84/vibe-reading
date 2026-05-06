import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Lightweight auth-state probe for client-side Nav. Lets us keep the root
 * layout fully static (no `cookies()` reads in the layout = no forced
 * dynamic rendering = landing can serve from CDN) while still letting the
 * Nav show "Library / Sign out" for signed-in users after hydration.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return NextResponse.json(
    { email: user?.email ?? null },
    {
      headers: {
        'cache-control': 'private, no-store',
      },
    },
  )
}
