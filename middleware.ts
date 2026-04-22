import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

const CHAPTER_ROUTES = /^\/b\/[^/]+\/(read|brief|restate)(\/|$)/
const PROTECTED_PREFIXES = ['/library']
const AUTH_ROUTES = ['/auth/login', '/auth/register']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh the session — do not remove, required for Server Components to read auth state.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const needsAuth =
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) ||
    CHAPTER_ROUTES.test(pathname)

  if (!user && needsAuth) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/auth/login'
    redirect.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(redirect)
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/library'
    redirect.search = ''
    return NextResponse.redirect(redirect)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
