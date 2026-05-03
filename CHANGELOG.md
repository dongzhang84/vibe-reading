# Changelog

Notable changes to Vibe Reading. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
internal milestones, not semver releases — this is a single-author indie
project and we haven't tagged anything yet.

For day-to-day commit history see `git log`. For deeper "why" context see
[`docs/vibe-reading.md`](./docs/vibe-reading.md) (product spec) and
[`docs/vibe-reading-implementation.md`](./docs/vibe-reading-implementation.md)
(tech walkthrough by Phase).

---

## [v2.1] — 2026-04-29 → ongoing

Quality-of-life iteration on the v2 MVP after a real-book test pass turned
up several rough edges. Driven by dogfooding, not by a roadmap.

### 2026-05-02 (late)

#### Changed
- **Orientation block on Book Home now matches the book's language.**
  Chinese book → Chinese prompts ("认识这本书 · 提问之前 / 这本书写的是什么样的
  主题？ / 作者是谁，什么背景？ / 这本书是写给谁的？ / 你希望从这本书获得什么
  信息？"). English book stays English. Detected via a cheap CJK-density
  heuristic on `book.overview` (which is AI-generated to match the book's body
  per the existing i18n rule), with `book.title` as fallback. Helper at
  `lib/text/lang.ts`. App-chrome strings (Library / Ask another / metadata
  lines) stay English regardless — only the orientation prompt mirrors the
  book.

#### Fixed
- **Relevance reasons now follow the BOOK's language, not the user's question
  language.** Previous design said "Chinese question → Chinese reason" — wrong:
  the reason describes the chapter's content, so it should match the chapter's
  language. English book + Chinese question used to produce mismatched Chinese
  reasons over English chapters; now produces English reasons (matches what
  you'd actually read in the chapter).
- **Front-matter / Part-divider filter expanded**. Previous filter missed
  several common TOC entries that were leaking into the chapter list and
  getting fed to relevance AI:
  - "Title" alone (without "page"), "Contents" / "Table of Contents",
    "List of tables" / "figures" / "illustrations" / "maps" / "abbreviations" /
    "plates" / "charts", "References" alone — all now treated as front-matter
    and kept in `book.toc` for display but excluded from chapter rows
  - Chinese front-matter list extended: "目录", "参考文献"
  - Part dividers (`Part I/II/III`, `第N篇/部`) are now excluded from chapter
    rows **regardless of source level**. Before: only excluded when descending
    to level 2; if a book had a single Part divider mixed with real chapters
    at level 1 (rare but observed in _The British Industrial Revolution_),
    the Part divider would slip through as a giant chapter blob. Fixed.

### 2026-05-02

#### Changed
- **Custom domain shipped**: live URL is now `https://vibe-reading.dev`
  (apex as primary; `www.vibe-reading.dev` 307s to apex). Followed
  STANDARD §12.B end-to-end — Vercel adds domain → Namecheap Advanced
  DNS gets Vercel's A + CNAME records → Supabase Auth Site URL +
  Redirect URLs updated. Code touched zero files: `NEXT_PUBLIC_APP_URL`
  is referenced only in `.env.local` examples (no actual `process.env`
  reads in code), and `app/layout.tsx` metadata has no `metadataBase`,
  so the cutover only required updating live-URL strings in 4 doc files
  (README en + zh, vibe-reading.md Status, impl-guide §2.5 + §Phase
  Mapping). Previous `vibe-reading-iota.vercel.app` URL still resolves.
- README Status sections (en + zh) refreshed: removed obsolete "Next:
  rate-limit / Sentry / cost ceiling" line, replaced with "Hardening
  (partial)" recap of v2.2/v2.3 + new "Next: solo-author UAT" framing.

#### Pitfalls hit during cutover (worth noting for future indie projects)
- **Vercel "Add Domain" defaulted www to Production**, not apex —
  even though the form takes the bare apex string, the resulting
  config had `www.vibe-reading.dev` set as the primary and apex 307'd
  to www. Had to manually flip in Settings → Domains → Edit (apex
  set to "Connect to environment: Production"; www set to "Redirect
  to Another Domain → vibe-reading.dev"). Once flipped, list mirrors
  what other projects (e.g. beprofitly.com) look like.
- **Vercel dashboard's deployment thumbnail for this project shows a
  cached 403 page** even after the primary flip + a fresh deploy.
  Live site (apex 200, www 307→apex) is fully correct via curl; the
  thumbnail just doesn't regenerate. Deployment Protection setting
  was tweaked, no observable effect on the dashboard image. Pure
  cosmetic — doesn't affect users, SEO, or actual deploys. Skipped.

### 2026-04-30 (late evening)

#### Added
- Per-user **storage quota** (Supabase Free is 1 GB shared with another
  app, so each user is hard-capped at **100 MB / 15 books**). Requires
  running `scripts/migrate-v2.3-storage-quota.sql` once (adds nullable
  `size_bytes bigint` to `vr.books`). New uploads write the actual blob
  size on `finalize`; pre-quota rows stay NULL and count as 0 (acceptable
  undercount). `/api/upload/init` rejects with a friendly 429 when over
  cap. `/library` page now shows a small `X MB / 100 MB used · N / 15
  books` line so users see how close they are.
- Per-user daily rate limits on every AI-spend endpoint: 50 questions,
  100 briefs, 200 highlight-asks, 5 uploads per day. Requires running
  `scripts/migrate-v2.2-rate-limit.sql` once in Supabase SQL Editor (adds
  `vr.usage_counters` table + atomic `vr.bump_usage` SQL function with a
  `for update` row lock so concurrent requests can't both pass the cap
  check). Implemented in `lib/usage/quota.ts`; called at the top of
  `/api/question`, `/api/question/[id]/retry`, `/api/brief` (only on
  cache miss — re-reads of an old brief don't burn quota), `/api/ask`,
  and `/api/upload/init` (skipped when caller is anonymous; see Known
  gaps below). 429 responses ship a friendly body the existing clients
  already render verbatim.

#### Known gaps
- Anonymous upload (drop a PDF before signing in) is not rate-limited
  — `usage_counters.user_id` references `auth.users(id)` and we don't
  have a real user_id pre-login. The OpenAI dashboard hard monthly cap
  is the real backstop here. Tracked in `docs/todo.md` bucket B.

### 2026-04-30 (evening)

#### Added
- `/library` book cards now show "Last asked: '...'" — the most recent
  question on each book, single-line truncated. Helps returning readers
  pick up mid-thought without opening every book to remember context.
  One DB round-trip per page render: `vr.questions` ordered by
  `created_at desc`, deduped to first-occurrence per book in JS.
- Small `← Library` ghost link in `ChapterListPane` header above the
  "Ask another question →" CTA. The global `Nav` is intentionally hidden
  on Question Result to keep the PDF split pane full-height; this gives
  readers a one-click way to leave the book entirely without unhiding Nav.
- `experimental.proxyClientMaxBodySize: '50mb'` in `next.config.ts` to
  raise Next.js 16's proxy 10MB default to match the app's own 50MB cap.
- Per-phase elapsed counter and cycling phase labels during the upload
  "analyzing" step. Server pipeline takes 10–25s for a big book and used
  to show one static label; now reads `Reading the book outline → Mapping
  chapter boundaries → Drafting your starter questions → Almost done`,
  sequenced to match the actual server work order with a live `(Ns)` tick.

#### Changed
- All four LLM calls now match output language to the source data:
  - `intake` follows the book's intro/conclusion language (Chinese book →
    Chinese overview + Chinese suggested questions).
  - `relevance` follows the user's question language (added Chinese
    few-shot phrasings: 可能包含 / 讨论了 / 涉及 / 介绍了).
  - `briefer` follows the chapter content language.
  - `asker` follows the highlighted passage language.
- Question Result page header link upgraded from a tiny ghost
  "← Back to book" arrow to a card-style "Ask another question →" CTA —
  matches the user's actual next intent ("ask again") instead of framing
  it as navigation ("go back").
- Orientation block on Book Home simplified from a 4-textarea form (with
  DB columns, Ask-area gate, and relevance-AI takeaway injection) to a
  pure static cognitive prompt. Rule 1 in its purest form: 4 questions are
  shown, the reader thinks them through silently, no input is captured.

#### Fixed
- **30MB PDF uploads were failing on Vercel** with `FUNCTION_PAYLOAD_TOO_LARGE`.
  Two stacked limits were in play: Next.js 16 proxy (10MB, fixed in
  `next.config.ts`) AND Vercel Hobby's serverless function payload cap
  (~4.5MB, no config available on Hobby). Refactored upload into 3 phases:
  client → `POST /api/upload/init` (signed URL) → client PUTs PDF directly
  to Supabase Storage → `POST /api/upload/finalize` (server pulls blob,
  parses, runs intake AI). The PDF never crosses a Vercel function.
- **Books with no Title metadata used to land as "Untitled"**.
  `parsePdf()` now falls back to the uploaded filename, with optional
  author extraction from a trailing `(Author Name)` group when it looks
  like a person.
- **Books with Part-Chapter structure (e.g. _Beyond Vibe Coding_) had
  Part I / II / III treated as single chapters** — relevance AI then
  matched all three Parts for any question because each Part contained 80+
  pages of content. `outline.ts` now picks chapter source level
  heuristically (descend to L2 when ≥60% of L1 entries are Part dividers
  AND L2 has ≥3 entries) and filters obvious front-matter (Cover,
  Copyright, Index, Bibliography, …) from chapter rows while keeping them
  in `book.toc` for display.
- Upload error UI now surfaces real diagnostics (HTTP status, size,
  elapsed seconds, content-type, body snippet) instead of a flat
  "Upload failed". Helped diagnose the body-limit chain above.

### 2026-04-29

#### Added
- Spec note for the Orientation ritual on Book Home (Rule 1 callout). The
  initial v2.1 design had user-typed answers + a take-away gate; the
  shipped 04-30 version is a static prompt — see above.

---

## [v2.0] — 2026-04-24

Full redesign from goal-driven (5 screens) to question-driven (4 screens).
Triggered by a real-book test where users couldn't express the *book-level*
goal in one sentence, and the chapter-splitter produced garbled text that
fed downstream AI calls into nonsense output.

### Added
- 4-screen flow: **Upload → Sign in → Book Home → Question Result**.
- Book Home (`/b/[bookId]`) — the new value-delivery point. Shows TOC,
  AI-generated overview, 3 starter questions, free-form input, and the
  history of past questions on this book.
- Question Result (`/b/[bookId]/q/[questionId]`) — split-pane: chapter
  list left, Brief / Read right. "← Back to book" header link.
- AI relevance call (`lib/ai/relevance.ts`) replaces the v1 three-color
  Map. Returns chapter handles + one-sentence reasons grounded in
  "likely contains / discusses / covers" framing (Rule 2).
- Schema migration: drop `goals` and `chapter_maps`, add `questions` and
  `question_chapters`, alter `briefs` to be keyed by `chapter_id` only
  (no per-goal cache anymore).
- New AI calls in `lib/ai/`: `intake.ts` (book overview + starter
  questions), `relevance.ts` (chapter ranking).

### Changed
- Login moved earlier in the flow (Upload → Sign in, not Map → Brief).
  The value-delivery point is now Book Home, so we can ask for sign-in
  before showing it without losing flow.
- v1's Restate / Check (Rule 4) deferred to v1.1: `vr.restatements`,
  `lib/ai/checker.ts`, `components/RestateScreen.tsx`, `/api/check` are
  all preserved but unhooked from the v1 UI.

### Fixed
- AI hallucinating chapter UUIDs: relevance prompt now uses short handles
  (`H1`, `H2`, …) constrained by JSON schema enum. Mapped back to UUIDs
  post-parse.
- Email login path was skipping `/auth/callback` claim; added explicit
  `/api/claim` call in the Email handler plus defensive inline claim in
  `/b/[bookId]` and `/library` server pages.

---

## [v1.0] — 2026-04-23

5-screen goal-driven MVP. Lived for ~24 hours before being redesigned;
the code/schema for several pieces (Restate, Check) survives into v2.

### Added
- Phases 4–12 of the implementation guide: PDF parse via `unpdf`, three
  paths to chapter splitting (TOC → regex → size), `/api/upload`,
  `/api/goal` + Goal Screen, three-color chapter map, Brief mode (Rule 3
  4-part structured brief), Restate + AI check (Rule 4), session-book
  claim on login, daily cron for unclaimed session-book cleanup, Read
  mode with PDF viewer and Highlight & Ask.
- v1 schema: `books`, `chapters`, `goals`, `chapter_maps`, `briefs`,
  `restatements`, all under the `vr` Postgres schema with RLS policies.

---

## [v0.1] — 2026-04-21

Initial commit: product spec, implementation guide skeleton, and the
project scaffold conventions inherited from the indie-product-playbook
STANDARD.

### Added
- `docs/vibe-reading.md` (product spec — Philosophy, 4 Design Rules,
  Differentiation, Login Strategy).
- `docs/vibe-reading-implementation.md` (Phase 0-N walkthrough).
- CI: `sprint-report` and `notify-playbook` workflows for cross-repo
  sprint-summary sync.

---

## Beyond MVP (not started)

See [`docs/todo.md`](./docs/todo.md) for the active backlog. Big buckets:

- **B · Hardening** before inviting strangers — rate-limit AI endpoints,
  Sentry, OpenAI cost ceiling, basic analytics, Storage lifecycle audit.
- **C · Beyond MVP** — Restate v1.1 reactivation, EPUB support,
  share/export, cross-book question history, multi-book compare, mobile
  responsive pass.
