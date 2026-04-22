import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'vr-session'
const ONE_DAY = 60 * 60 * 24

export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(COOKIE_NAME)?.value
  if (existing) return existing

  const sid = crypto.randomUUID()
  jar.set(COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: ONE_DAY,
    path: '/',
  })
  return sid
}

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}
