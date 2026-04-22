import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/db'

export function createClient() {
  return createBrowserClient<Database, 'vr'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'vr' } },
  )
}
