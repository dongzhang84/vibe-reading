# Vibe Reading

A reading tool that refuses to summarize the book before you tell it why you're reading it.

一个拒绝替你总结全书的读书工具——除非你先告诉它你为什么要读。

## Philosophy

> The bottleneck of learning is not information transfer, but information compression. AI cannot do the compression for you — compression must happen in your brain, using your existing cognition as hooks.

![Vibe Reading product flow](./diagram/product-flow/diagram.svg)

## Docs

- [Product Spec](./docs/vibe-reading.md) — what it is, who it's for, the 4 design rules
- [Implementation Guide](./docs/vibe-reading-implementation.md) — phase-by-phase build instructions
- [UI Design Report](./docs/ui-design-report.md) — tokens, components, design rules
- [TODO](./docs/todo.md) — what's shipped, what's next (3 buckets: polish / harden / expand)

## Status

✅ **MVP shipped** — 2026-04-27. Question-driven flow live end-to-end (upload → ask → matched chapters with Brief / Read split-pane). Notion-warm UI with light/dark toggle. Self-tested on real books.

Next: production hardening (rate limit + error tracking + cost ceiling) before opening to friends. See [todo.md](./docs/todo.md) bucket B.

## Stack

- Next.js 16 App Router + Turbopack + TypeScript + Tailwind v4 + shadcn/ui (used sparingly)
- Supabase (Auth + Postgres + Storage) — Supabase-only, no Prisma
- OpenAI `gpt-4o-mini` for intake (overview + 3 questions), relevance (chapter ranker), briefer (4-part note), asker (passage Q&A) — all with JSON schema strict mode
- `unpdf` (serverless pdfjs fork) for PDF parsing + outline extraction; `react-pdf` for in-browser viewer
- Vercel deploy
- **No Stripe** — this is an open-source project. MVP is free.

## License

TBD (likely MIT or similar permissive license).
