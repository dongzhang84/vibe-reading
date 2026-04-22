import { UploadDropzone } from '@/components/UploadDropzone'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-16 px-6 py-16">
      <section className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Vibe Reading
          </h1>
          <p className="text-xl leading-8 text-zinc-700 dark:text-zinc-300">
            A reading tool that refuses to summarize the book before you tell it
            why you&apos;re reading it.
          </p>
        </header>

        <UploadDropzone />

        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Vibe Reading is different. We won&apos;t summarize your book until you
          tell us why you&apos;re reading it. This is not a bug.
        </p>
      </section>

      <section className="border-t border-zinc-200 pt-12 dark:border-zinc-800">
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          The bottleneck of learning is not information transfer, but
          information compression. AI cannot do the compression for you —
          compression must happen in your brain, using your existing cognition
          as hooks.
        </p>
      </section>
    </main>
  )
}
