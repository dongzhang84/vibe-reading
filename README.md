**English** · [中文](./README.zh-CN.md)

# Vibe Reading

**A reading tool that refuses to summarize the book before you tell it why you're reading it.**

> A reading tool that refuses to summarize the whole book for you — unless you tell it first why you're reading.

🔗 **Live demo**: [vibe-reading-iota.vercel.app](https://vibe-reading-iota.vercel.app/)

---

## The idea

Most AI reading tools are summarizers in disguise. You upload a book, click a button, and get a digested take you'll forget by tomorrow. The bottleneck of learning isn't getting information into your head — it's the *compression* that happens inside it. AI can't do that compression for you.

So Vibe Reading **refuses to summarize until you ask a question**. The question is the index. Once you've asked it, the AI maps your question to the chapters that answer it, hands you a 4-part structured note (claim · 3 key points · example · what's not addressed) beside the original PDF, and stays out of your way while you read.

> "The bottleneck of learning is not information transfer, but information compression. AI cannot do the compression for you — compression must happen in your brain, using your existing cognition as hooks."

![Vibe Reading product flow](./diagram/product-flow/diagram.svg)

---

## What's different

| vs | What this tool does instead |
|---|---|
| **ChatPDF** | Refuses one-click summary; the question must come first. AI is a chapter-mapper, not a content paraphraser. |
| **NotebookLM** | Not a knowledge-base for retrieval; a reading workflow for compression. |
| **AI summary tools** | Won't compress for you. Compression is the work; AI maps and challenges, never replaces. |
| **Plain PDF reader + chat** | Bakes the Feynman-style "ask first → compare your understanding" loop into the product itself. |

The full philosophy and design rules live in [`docs/vibe-reading.md`](./docs/vibe-reading.md).

---

## How it works

A 4-screen flow, end-to-end:

1. **Upload** — drop a PDF. Sign in. The book is bound to your account.
2. **Book Home** — see the table of contents, a one-paragraph book overview, and three AI-suggested starter questions. Type your own, or click one of the suggestions.
3. **Question Result** — left side: the chapters most likely to answer your question, each with a one-sentence reason ("likely contains…", "discusses…"). Right side, on click: **Brief** (4-part structured note) or **Read** (PDF jump to that chapter, with highlight & ask).
4. **(Reserved for v1.1)** — interactive restate / Feynman check. Code preserved, UI hidden in v1.

Under the hood it's just `pdfjs` for structure extraction + four narrow `gpt-4o-mini` calls (intake · relevance · briefer · asker), all with JSON schema strict mode. **No vector DB, no embeddings, no RAG framework.** A book with 23 chapters costs roughly one penny per question.

Tech-pipeline diagram: [`diagram/tech-pipeline/diagram.svg`](./diagram/tech-pipeline/diagram.svg).

---

## Stack

- **Next.js 16** App Router + Turbopack + **TypeScript** strict
- **Tailwind CSS v4** + shadcn/ui (used sparingly — most components hand-rolled)
- **Supabase** (Auth + Postgres + Storage) — Supabase-only, no Prisma, no Drizzle
- **OpenAI** `gpt-4o-mini` for all AI calls
- [`unpdf`](https://github.com/unjs/unpdf) (serverless pdfjs fork) for parsing + outline extraction
- [`react-pdf`](https://github.com/wojtekmaj/react-pdf) for the in-browser viewer
- Deployed on **Vercel**
- **No Stripe, no analytics, no toast library, no animation library, no Figma.** Indie + minimal by intent.

---

## Run locally

This is an indie project, but it's a real Next.js app — easy to fork.

```bash
git clone https://github.com/dongzhang84/vibe-reading.git
cd vibe-reading
npm install
cp .env.local.example .env.local   # if it exists; otherwise create per the table below
```

You need a Supabase project (free tier is fine) and an OpenAI API key. Fill `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=                    # any random string for local
```

Then set up the schema. In Supabase Dashboard → SQL Editor, paste **Path A** from [`docs/vibe-reading-implementation.md`](./docs/vibe-reading-implementation.md#phase-2--数据库-schema-v2) (the "fresh install" SQL block). It creates the `vr` schema, all tables, RLS policies, and indexes. Add `vr` to **Settings → API → Exposed Schemas**.

```bash
npm run db:types    # regenerate types/db.ts (optional but recommended)
npm run dev
```

Open `http://localhost:3000`. Drop a PDF.

> **Configuring auth providers** (Google OAuth) is documented in `docs/vibe-reading-implementation.md` Phase 3. Email/password works out of the box once Supabase Auth is enabled.

---

## Project layout

| Path | What's there |
|---|---|
| `app/` | Next.js App Router — pages, API routes, layouts |
| `components/` | All UI (Nav, ChapterListPane, BriefPane, ReadPane, PdfViewer, …) |
| `lib/ai/` | The four LLM call sites — `intake`, `relevance`, `briefer`, `asker` |
| `lib/pdf/` | `outline.ts` (pdfjs.getOutline) + `parser.ts` (regex-based fallback) |
| `lib/supabase/` | Client / server / admin Supabase clients with `vr` schema scoping |
| `docs/` | Spec, implementation guide, UI design report, todo |
| `diagram/` | Hand-written SVG diagrams (product flow + tech pipeline) |
| `scripts/` | Probes (`probe-schema-v2.mjs`, `smoke-m1.mjs`, `diag-relevance.mjs`) for local debugging |

Detailed docs:

- [Product Spec](./docs/vibe-reading.md) — philosophy, target users, 4 design rules
- [Implementation Guide](./docs/vibe-reading-implementation.md) — phase-by-phase build, prompts, schema, env vars
- [UI Design Report](./docs/ui-design-report.md) — design tokens, component layering, visual rules
- [TODO](./docs/todo.md) — what's shipped, what's next

---

## Status

✅ **MVP shipped** — 2026-04-27. The full question-driven flow is live, including PDF zoom + dark mode + delete-book + 0-match retry. Self-tested on real books.

🚧 **Next**: production hardening (rate limit · error tracking · cost ceiling) before opening to friends. See [todo.md](./docs/todo.md) bucket B.

🔮 **Reserved for v1.1**: interactive restate / Feynman check (code preserved in `vr.restatements` + `lib/ai/checker.ts` + `components/RestateScreen.tsx`).

---

## Contributing

This is a solo-author indie project, but PRs and issues are welcome:

- **Bug reports** with reproduction steps are extra appreciated.
- **Feature ideas** that align with the spec's "refuse to summarize" stance are interesting; ideas that turn it into another summarizer are not the project.
- **UI polish PRs** are very welcome — `docs/ui-design-report.md` § 8 has a punch list of known visual gaps.
- For larger changes, please open an issue first to align on direction.

The project's design rules ([`docs/vibe-reading.md` §The 4 Design Rules](./docs/vibe-reading.md)) are intentionally restrictive. Rule 1 ("AI doesn't speak about chapter content before the user asks") is the project's reason to exist — please don't try to relax it.

---

## Acknowledgments

Built on the shoulders of:

- [Next.js](https://nextjs.org/) + [Vercel](https://vercel.com/) — hosting and the framework
- [Supabase](https://supabase.com/) — auth + Postgres + Storage in one
- [OpenAI](https://openai.com/) — `gpt-4o-mini` does all the AI work
- [unpdf](https://github.com/unjs/unpdf) — the only PDF parser that survives Next.js Turbopack
- [react-pdf](https://github.com/wojtekmaj/react-pdf) — in-browser viewer
- [shadcn/ui](https://ui.shadcn.com/) + [lucide-react](https://lucide.dev/) — component primitives + icons
- [Geist font](https://vercel.com/font) — typography

---

## License

MIT (see [`LICENSE`](./LICENSE) once added — currently TBD pending project decisions; treat as MIT-spirited until then).
