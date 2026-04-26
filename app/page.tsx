import { BookOpen, Brain, Sparkles, Target, Upload } from 'lucide-react'
import { UploadDropzone } from '@/components/UploadDropzone'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-16 md:pt-24 md:pb-24">
          <div className="mb-12 text-center md:mb-16">
            <h1 className="mb-6 text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Don&apos;t read on autopilot.
              <br />
              <span className="text-muted-foreground">
                Read with a question.
              </span>
            </h1>
            <p className="mx-auto max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              We won&apos;t summarize your book until you tell us why
              you&apos;re reading it. This is not a bug — it&apos;s the
              philosophy.
            </p>
          </div>

          <UploadDropzone />
        </section>

        {/* Philosophy */}
        <section
          id="philosophy"
          className="border-y border-border bg-secondary/50"
        >
          <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <h2 className="mb-6 text-sm font-medium uppercase tracking-wider text-accent">
                Our Philosophy
              </h2>
              <blockquote className="text-balance text-2xl font-medium leading-snug tracking-tight text-foreground md:text-3xl">
                &ldquo;The bottleneck of learning is not information transfer,
                but information compression.&rdquo;
              </blockquote>
              <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground">
                AI cannot do the compression for you — compression must happen
                in your brain, using your existing cognition as hooks.
                That&apos;s why we ask why before we summarize.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="mb-12 text-center md:mb-16">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Reading, reimagined
            </h2>
            <p className="mt-3 text-muted-foreground">
              Tools designed for intentional learning
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Target className="h-5 w-5" />}
              title="Question-first"
              description="Ask what you actually want to know. The AI maps your question to the chapters that answer it — no whole-book summary."
            />
            <FeatureCard
              icon={<Brain className="h-5 w-5" />}
              title="Brief, then read"
              description="A 4-part structured note (claim · 3 key points · example · what's not addressed) sits beside the original PDF."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Highlight & ask"
              description="Select a passage in the PDF and ask in context. The AI explains that passage, not the whole chapter."
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-6 pb-16 md:pb-24">
          <div className="rounded-2xl border border-border bg-card p-8 text-center md:p-12">
            <h2 className="mb-4 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Ready to read with purpose?
            </h2>
            <p className="mx-auto mb-8 max-w-md text-muted-foreground">
              Drop your first PDF. We&apos;ll extract the table of contents,
              draft an overview, and suggest three starter questions.
            </p>
            <button
              type="button"
              onClick={() => document.getElementById('vr-file-upload')?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Upload Your Book
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm">Vibe Reading</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built for intentional readers.
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-6 transition-colors hover:bg-secondary/50">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-foreground/5">
        {icon}
      </div>
      <h3 className="mb-2 font-medium text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
