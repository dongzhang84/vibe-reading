import { UploadDropzone } from '@/components/UploadDropzone'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-14 px-6 py-20">
      <header className="flex flex-col gap-5">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          Vibe Reading
        </h1>
        <p className="text-lg leading-relaxed text-foreground/80">
          A reading tool that refuses to summarize the book before you tell it
          why you&apos;re reading it.
        </p>
      </header>

      <UploadDropzone />

      <p className="text-sm leading-relaxed text-muted-foreground">
        Vibe Reading is different. We won&apos;t summarize your book until you
        tell us why you&apos;re reading it. This is not a bug.
      </p>

      <hr className="border-border" />

      <section className="text-sm leading-7 text-muted-foreground">
        <p>
          The bottleneck of learning is not information transfer, but
          information compression. AI cannot do the compression for you —
          compression must happen in your brain, using your existing cognition
          as hooks.
        </p>
      </section>
    </main>
  )
}
