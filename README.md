# Vibe Reading

A reading tool that refuses to summarize the book before you tell it why you're reading it.

一个拒绝替你总结全书的读书工具——除非你先告诉它你为什么要读。

![Vibe Reading product flow](./diagram/product-flow/diagram.svg)

## Philosophy

> The bottleneck of learning is not information transfer, but information compression. AI cannot do the compression for you — compression must happen in your brain, using your existing cognition as hooks.

## Docs

- [Product Spec](./docs/vibe-reading.md) — what it is, who it's for, the 4 design rules
- [Implementation Guide](./docs/vibe-reading-implementation.md) — phase-by-phase build instructions (Next.js 14 + Supabase + OpenAI)

## Status

💡 Proposal — 2026-04-21. Docs complete, not yet scaffolded.

## Stack

- Next.js 14 App Router + TypeScript + Tailwind + Shadcn/ui
- Supabase (Auth + Postgres + Storage) — Supabase-only, no Prisma
- OpenAI (gpt-4o-mini) for chapter mapping, briefs, and understanding checks
- Vercel deploy
- **No Stripe** — this is an open-source project. MVP is free.

## License

TBD (likely MIT or similar permissive license).
