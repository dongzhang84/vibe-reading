import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/Nav'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Vibe Reading',
  description:
    "A reading tool that refuses to summarize the book before you tell it why you're reading it.",
  openGraph: {
    title: 'Vibe Reading',
    description:
      "A reading tool that refuses to summarize the book before you tell it why you're reading it.",
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe Reading',
    description:
      "A reading tool that refuses to summarize the book before you tell it why you're reading it.",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Pull auth state once at the layout level so every page's nav is correct
  // on first paint. Nav itself decides whether to render based on pathname.
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Nav user={user ? { email: user.email ?? null } : null} />
        {children}
      </body>
    </html>
  )
}
