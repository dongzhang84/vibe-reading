import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

// Admin client bypasses RLS — server-side only (Route Handlers, Server Actions, Cron).
// Never import into client components or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createClient<Database, 'vr'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'vr' },
    },
  )
}
