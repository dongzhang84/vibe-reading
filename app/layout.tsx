import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/Nav'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // NOTE: this layout is intentionally **synchronous** — it does NOT call
  // supabase.auth.getUser() or any other dynamic API. Reading cookies in
  // the root layout would force every route (including landing) to be
  // dynamic-rendered on every request, killing CDN caching and leaving
  // landing exposed to cold-start latency.
  //
  // Auth state is fetched client-side by Nav via /api/me — see
  // components/Nav.tsx + app/api/me/route.ts.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Set the dark/light theme BEFORE React hydrates to avoid a flash
            of the wrong palette. Reads localStorage('vr-theme'); falls back
            to the OS prefers-color-scheme on first visit. Wrapped in
            try/catch so blocked-storage browsers (private mode) silently
            fall through to the OS preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('vr-theme');var p=matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&p))document.documentElement.classList.add('dark');}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Nav />
        {children}
      </body>
    </html>
  )
}
