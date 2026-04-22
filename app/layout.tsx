import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

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
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
