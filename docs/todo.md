# Vibe Reading — TODO

> Living list of things not yet done. Three buckets, ordered roughly by
> "ship-blocker → polish → new edge".
>
> **Current focus (2026-05-14): hardening (Sentry + Posthog) + export-TXT.**
>
> EPUB shipped 2026-05-13 (merged via PR #1 — see "Done" section below
> for the full ladder of phases E1–E7 plus the parser / typography /
> font-toggle / continuous-scroll follow-ups). First real-book test was
> _Atomic Habits_; other books in `docs/epub-support.md` §E7 are still
> open as opportunistic QA.
>
> Now that EPUB users + cold-email batch are in prod, the §B hardening
> items finally bite — Sentry first (user-reported bugs come with stack
> traces; we currently only get whatever lands in Vercel logs), Posthog
> after when there's enough traffic to draw funnel conclusions.
>
> Export-TXT (§C) is also queued near the top — promised to Jason in
> the 2026-05-12 reply email, lightweight to ship (≤ 1 day).
>
> Last updated: 2026-05-14 (post EPUB merge + Nav refetch-on-pathname fix).

---

## A. Polish (low-effort visible wins)

Each ~15–45 min. None block anything. Pick when you want a clean break.

> **Status: all current items shipped.** Add new polish here as you
> notice it during dogfooding.

- [x] ~~**Auth pages (`/auth/login`, `/auth/register`) UI pass**~~ —
      shipped 2026-04-26. Notion-warm tokens, BookOpen brand mark,
      primary pill submit, STANDARD.md §3.2 copy
- [x] ~~**Delete-book affordance on `/library`**~~ — shipped 2026-04-26.
      3-dot menu → "Delete book" with quoted title in confirm dialog.
      `DELETE /api/books/[id]` cascades all related rows + removes
      Storage blob
- [x] ~~**Dark mode toggle in Nav**~~ — shipped 2026-04-26. Sun/Moon
      button at the right of Nav. localStorage key `vr-theme`; first
      visit follows OS `prefers-color-scheme`, after click locks to
      user choice. Inline script in `<head>` applies the class before
      React hydrates → no flash of wrong palette on reload
- [x] ~~**PDF viewer keyboard shortcuts**~~ — shipped 2026-04-26.
      `+`/`=` zoom in, `-`/`_` zoom out, `0` fit width, `g` focus the
      page-jump input. Skips when typing in any input/textarea/
      contenteditable; skips when modifier keys held (so Cmd+0 still
      zooms the browser). Page input also added to toolbar
- [x] ~~**Question Result empty state**~~ — shipped 2026-04-26. New copy:
      "AI couldn't map this question to specific chapters." Two CTAs:
      Retry (re-runs relevance via `POST /api/question/[id]/retry`,
      replaces existing `question_chapters`) + Back to book
- [x] ~~**`/library` book card metadata**~~ — shipped 2026-04-30. Each
      book card now shows "Last asked: '...'" using a single PostgREST
      query for all the user's books' questions, deduped to first-
      occurrence (created_at desc) in JS. Single-line truncated; only
      renders when the book actually has a question history

---

## B. Hardening (do BEFORE inviting strangers)

These are the "production safety" gaps. Without them, a single curious user
can run up an OpenAI bill, or you'll find out about prod errors only after
the user complains.

- [x] ~~**Rate-limit AI endpoints**~~ — shipped 2026-04-30. Per-user
      daily caps (50 questions, 100 briefs, 200 asks, 5 uploads) via
      `vr.usage_counters` + `vr.bump_usage` SQL function (atomic
      check-and-increment with `for update` row lock). Wired into
      `/api/question`, `/api/question/[id]/retry`, `/api/brief` (cache
      miss only — re-reads don't burn quota), `/api/ask`, and
      `/api/upload/init` (when authenticated). Helper at
      `lib/usage/quota.ts`. **Known gap**: anonymous upload (drop PDF
      pre-login) skips quota since `user_id` doesn't exist yet — relies
      on the OpenAI dashboard monthly hard cap. Worth fixing in a
      follow-up: extend usage_counters schema to allow session_id keys,
      or auth-gate uploads
- [ ] **Supabase storage capacity expansion** — watch, not urgent.
      Current usage 741.3 MB / 1024 MB (~72%) as of 2026-05-14, up only
      ~28 MB across 2 days (slower than the initial 25 MB/day estimate
      — orphan cleanup and cold-email batch tail-off helped). At this
      pace ~4 weeks to ceiling. Shared project with launchradar + AIfy
      means three products competing for the 1 GB Free cap. Options:
      (a) **Supabase Pro upgrade** — $25/mo gives 100 GB storage + 8 GB
          DB + daily backups. Cleanest path, also unlocks point-in-time
          recovery which we want before scaling
      (b) **Move PDFs to Cloudflare R2** — ~$0.015/GB/mo, zero egress
          fees. Cheaper at scale but adds a second provider to the
          stack and rewrites the storage layer
      (c) **Aggressive inactivity-based retention** (see §C bullet) +
          shrink per-user quota — buys weeks, not months
      Recommend (a) when usage hits ~90% (~920 MB) or before any new
      user wave. Belt-and-suspenders: ship the orphan cron (§C) and
      inactivity retention in parallel so we're not paying for waste
- [ ] **Error tracking (Sentry / Highlight / similar)** — only console.error
      right now; prod errors invisible unless we manually check Vercel logs.
      Free tier is fine for an MVP. Hook it into `app/error.tsx` +
      `app/global-error.tsx` + each `/api/*` route's catch block.
      **Deferred (2026-04-30)**: not needed during solo dogfood (creator
      hits and fixes own bugs). Pick this up the week before §12.C —
      inviting 5-10 friends — when remote-error visibility actually
      starts mattering
- [x] ~~**OpenAI cost ceiling**~~ — done 2026-04-30 (manual step in
      OpenAI dashboard). Hard monthly cap + alert email set. Belt +
      suspenders with the rate-limit and storage cap
- [ ] **Basic usage analytics (Posthog / Plausible)** — funnel visibility:
      how many uploaders ever ask a question? how many askers ever click
      Brief or Read? Drives the next product iteration. Posthog free tier
      is enough. **Deferred (2026-04-30)**: same reasoning as Sentry —
      no funnel data worth analyzing during solo dogfood. Pick up before
      §12.C friends test
- [x] ~~**Supabase Storage lifecycle audit / per-user quota**~~ —
      shipped 2026-04-30. Per-user hard caps (100 MB / 15 books)
      enforced at `/api/upload/init` via `lib/usage/quota.ts`.
      `vr.books.size_bytes` added in
      `scripts/migrate-v2.3-storage-quota.sql`. `/library` shows
      "X MB / 100 MB used · N / 15 books" so users see headroom.
      Sized for Supabase Free (1 GB) shared with launchradar. **Not
      addressed**: archive flow for old books, and the cron audit
      (current cron only sweeps unowned/orphan rows; owned books
      stay forever, but per-user cap now bounds total)

---

## C. Beyond MVP (real product expansion — needs time + decision)

Each is multi-day. Don't start until A + B are clean and 5–10 friends have
tried v1.

- [ ] **Restate v1.1 (Reserved per spec)** — `vr.restatements` table,
      `lib/ai/checker.ts`, `components/RestateScreen.tsx`, `/api/check` are
      all preserved but unhooked. v1.1 plan: BriefPane gets an optional
      "Restate this" button → modal → user writes → AI plays
      "another reader in the room" (gentle, not grading). Spec §Rule 4
      describes this
- [ ] **5–10 friends user-test (spec §Success Criteria Week 2–4)** — most
      important non-coding step. Ship to friends → observe where they
      stall. Likely failure modes per spec: (a) can't write the goal/
      question, (b) skip Brief / Read, (c) treat the AI summary as the
      answer instead of triggering compression. Iterate based on
      what's actually broken — don't pre-build for hypotheses
- [ ] **Share / export Question Result** — turn a great Q+chapter map into
      a public read-only URL or markdown export. Potential viral surface
- [ ] **Export reading outputs to TXT** — surfaced from Jason's feedback
      2026-05-12 (worry: "what if the site disappears, my reading is
      gone"). Per-book download: bundle the Brief, all asked-questions
      with their AI answers, and any highlighted passages into a plain
      TXT (or Markdown) file the user keeps locally. Promised in the
      reply email — send a follow-up when shipped. Lightweight: no new
      schema, just a `/api/books/[id]/export` route that walks the
      existing tables and concats. Estimated 0.5–1 day
- [ ] **BYO API key (free tier) + we-provide API (paid tier)** — surfaced
      from Jason's feedback 2026-05-12. Two-tier model: (a) **free** —
      user pastes their own OpenAI / Anthropic key into Settings, we
      route all their AI calls through it; (b) **paid** — we provide
      the key, zero setup. BYO opens the door to power users while
      capping our cost exposure. Needs: settings UI for key entry
      (encrypted at rest, never logged); validation probe on save; a
      switch in `lib/ai/*` to prefer user key when present; usage
      accounting that distinguishes BYO from ours (BYO shouldn't burn
      our rate-limit quota the same way). Model-selection UI (gpt-4o
      vs claude-3-5-sonnet etc.) is a natural extension
- [ ] **`/library` cross-book question history** — global "Your questions
      across all books" view. Find old questions without remembering which
      book
- [ ] **Multi-book compare** — spec §"What it's NOT" rules this out for
      v1, but interesting v2 territory: ask one question across N books in
      your library, see which book best answers it
- [ ] **Mobile responsive pass** — spec cuts mobile from MVP, but the
      stack supports it. Most pages already use `lg:` breakpoint sensibly;
      just need a tighter pass on Question Result split-pane (collapse to
      tabs on `<lg`)
- [ ] **Periodic orphan-storage cron** — `scripts/cleanup-orphan-pdfs.mjs`
      currently has to be run by hand. Wire it into the daily cron
      (`app/api/cron/cleanup/route.ts`) so any storage blob without a
      matching `books` row gets swept. Belt to the suspenders of the
      claim/delete fixes shipped 2026-05-02 (those handle the predictable
      stale-path failure mode; this catches network-blip orphans). Low
      priority — current orphans are cleaned, fixes block new ones from
      forming under normal operation
- [ ] **Inactivity-based PDF retention** — when Free 1 GB starts feeling
      tight (≥ 600 MB used or right before opening to strangers): add a
      cron that, for any book whose `last_activity_at` is > 30 days
      stale, removes the Storage blob and nulls `books.storage_path`.
      The book row + chapters + questions + briefs all stay so the
      reader keeps the value of past reading; `/library` shows
      "PDF expired — re-upload to read again". Aligns with the project
      stance ("compression happens in your head, not on disk") better
      than hard-delete-after-N-days. Discussed and deferred 2026-05-01:
      current 100 MB/user × 15-book cap already bounds total bucket
      footprint, no immediate pressure

---

## Done (just landed — for context)

Quick reference of what's been shipped recently. Full history in `git log`
and [`CHANGELOG.md`](../CHANGELOG.md).

**EPUB support v1 (2026-05-12 → 05-14, merged via PR #1)**
- ✅ Schema migration v2.4 — `vr.books.format` (`'pdf' | 'epub'`),
  `vr.chapters.content_html`. Idempotent migration in
  `scripts/migrate-v2.4-format.sql`
- ✅ Upload format dispatch — `/api/upload/init` whitelists `.epub`,
  `/api/upload/finalize` branches by storage-path suffix.
  UploadDropzone widens its `accept` + content-type inference
- ✅ EPUB parser (`lib/epub/{parser,outline,sanitize,detect}.ts`)
  using `jszip` + `fast-xml-parser`. OPF metadata + spine, NCX (EPUB 2)
  + NAV (EPUB 3) outline, XHTML→safe-HTML sanitize (allowlist of tags,
  no scripts / event handlers / js: URLs). EpubParseError codes
  (DRM / image-only / empty-spine / …) map to friendly 4xx messages
- ✅ ReadPane format split — new `EpubChapterView` + new
  `GET /api/books/[id]/chapters-html`. **Continuous-scroll** flow:
  clicking Read on chapter N positions the viewport at N but the rest
  of the book is right there to scroll into (matches PDF flow). Each
  chapter wrapped in `<section data-chapter-id>` so the Ask flow
  resolves the chapter from the live selection, not the originally-
  clicked chapter
- ✅ Library + landing polish — `EPUB` pill on EPUB cards, page-count
  line says "chapters" for EPUB; landing copy says "PDF or EPUB"
- ✅ Parser quality follow-ups: TOC-first title resolution, short-
  chapter coalesce (folds part-dividers into their next substantive
  chapter so the list isn't 70+ rows of fragments), chapter-number
  `<h2>` → `<h1>` promotion for visual hierarchy
- ✅ Read-pane typography — installed `@tailwindcss/typography` v4,
  registered via `@plugin`, then bypassed the prose-X:utility modifier
  syntax (unreliable with shadcn's heading reset) by writing native
  `.prose h1 / h2 / h3 / p / …` CSS in `app/globals.css`
- ✅ Font-size toggle — A | A pill in the EPUB Read pane header,
  4-step scale (0.9 / 1.0 / 1.15 / 1.3), persisted in localStorage;
  wired via `--prose-scale` CSS variable so headings + body scale
  uniformly
- ✅ Quota exempt list — opt-in `QUOTA_EXEMPT_USER_IDS` env var
  bypasses daily-action + storage caps. For dev / test accounts so
  iteration isn't blocked
- ✅ Nav refetch on pathname change — Email/Password sign-in via
  `router.push()` doesn't remount Nav, leaving it stuck on its
  pre-login state. Adding `pathname` to the `/api/me` useEffect deps
  triggers a refetch on the post-login route change
- Real-book QA still open for §E7 test set (only _Atomic Habits_
  tested so far — DDIA / 三体 / 沉默的大多数 / DRM EPUB /
  single-XHTML / image-only EPUB remain). Production deployment is
  live since 2026-05-13; opportunistic testing as new books come in

**Launch + early-user wave (2026-05-09)**
- ✅ Twitter launch post; ~33 new users / 38 books in first 24h
- ✅ Cold reach-out tooling open-sourced — `scripts/draft-cold-emails.mjs`
  + `scripts/send-cold-emails.mjs` + `marketing/templates/` + selective
  `.gitignore` so user PII stays local but tools + templates ship with
  the repo
- ✅ Sent personalized cold reach-out (33 emails, two Chinese templates
  for uploaded vs signed-up-no-upload tiers)

**Landing performance round (2026-05-04 → 05-06)**
- ✅ Lazy-load `UploadDropzone` + lazy-import supabase in `Nav` —
  initial JS 850 KB → 627 KB (-26%)
- ✅ Make `/` statically prerendered: `app/layout.tsx` no longer reads
  cookies; `Nav` fetches `/api/me` client-side. TTFB 800-1000ms cold /
  220ms warm → 120-155ms globally consistent (CDN HIT, no function
  invocation)

**Bug fixes (2026-05-02 → 05-08)**
- ✅ Storage orphan bug — claim path-update error checked + roll back
  move; DELETE tries dual paths (session + user); cleanup-orphans
  script
- ✅ NUL-byte chapter insert fix — `stripNul()` at parser/outline source
  + defensive belt at finalize, kills Postgres `22P05` for PDFs with
  embedded font subsets
- ✅ Custom domain `vibe-reading.dev` (apex primary, www 307 to apex)
- ✅ Orientation block matches book language (Chinese/English)
- ✅ Relevance reasons match book language (not question language)
- ✅ Outline parser: front-matter filter expanded; Part divider always
  excluded

**v2.2 / v2.3 hardening — partial (2026-04-30)**
- ✅ Per-user daily rate limits on every AI-spend endpoint
  (`/api/question` / `…retry` / `/api/brief` / `/api/ask` /
  `/api/upload/init` when auth'd). Backed by `vr.usage_counters`
  + atomic `vr.bump_usage` RPC. Brief checks quota only on cache
  miss
- ✅ Per-user storage quota — 100 MB / 15 books, enforced on
  `/api/upload/init` (when auth'd). Sized for Supabase Free 1 GB
  shared with launchradar. `/library` shows live usage line

**v2.1 quality-of-life iteration (2026-04-29 → 04-30)**
- ✅ Orientation block on Book Home — initially shipped as a 4-textarea
  form with DB columns + Ask-area gate + relevance-AI takeaway injection;
  same-day simplified to a static cognitive prompt (no input, no DB, no
  AI). "AI doesn't write here" doesn't imply "user must type here"
- ✅ PDF title fallback — when `info.Title` metadata is missing, derive
  from filename (strip `.pdf`, normalize separators, peel trailing
  `(Author Name)` if it looks like a person)
- ✅ Outline chapter-source-level picker + front-matter filter — books
  with Part-Chapter structure (e.g. _Beyond Vibe Coding_'s Part I/II/III)
  now slice at the right level instead of treating each Part as a single
  80-page chapter; Cover/Copyright/Index etc. stay in `book.toc` for
  display but stay out of the chapter rows fed to relevance AI
- ✅ Upload refactor: 3-phase direct-to-Supabase to bypass Vercel Hobby's
  ~4.5MB function payload limit. Client → `POST /api/upload/init`
  (signed URL) → client PUTs to Supabase Storage directly →
  `POST /api/upload/finalize` (server pulls blob, parses, runs intake
  AI). Also raised Next.js 16's proxy 10MB cap via
  `experimental.proxyClientMaxBodySize: '50mb'`
- ✅ Upload progress UX — per-phase elapsed counter + cycling phase
  labels matching the server pipeline order (`Reading the book outline
  → Mapping chapter boundaries → Drafting your starter questions →
  Almost done`)
- ✅ AI output language matches source — explicit `LANGUAGE:` rule in
  every prompt: intake follows book body, relevance follows question,
  briefer follows chapter content, asker follows highlight passage.
  Chinese few-shots added to relevance prompt (可能包含 / 讨论了 / 涉及
  / 介绍了)
- ✅ Question Result navigation — `← Back to book` upgraded to a card
  CTA `Ask another question →`; small `← Library` ghost link added
  above for the quick "switch books entirely" action without unhiding
  the global Nav (which would crop the PDF viewport)
- ✅ /library "Last asked: '...'" — most recent question per book
  rendered on each card

**Functional flow (M1–M3, the v2 redesign foundation)**
- ✅ v1 → v2 schema migration (drop goals/chapter_maps, add questions /
  question_chapters, alter briefs to chapter_id-only)
- ✅ Question-driven 4-screen flow (Upload → Sign in → Book Home →
  Question Result with split-pane Brief / Read)
- ✅ AI pipeline: intake (overview + 3 starter questions), relevance
  (chapter ranking via short `H1`/`H2`/... handles + JSON-schema enum
  to defeat UUID hallucination), briefer (4-part), asker (passage-
  level). All `gpt-4o-mini` + JSON schema strict mode
- ✅ Auth flow: Google OAuth + Email/Password, with claim on every login
  path (callback inline + Email path explicit + defensive in
  /b/[id] + /library)

**UI / experience polish (this round)**
- ✅ Site-wide Nav (sticky, auth-aware, pathname self-hide)
- ✅ Notion-warm UI overhaul across landing, /library, Book Home, and
  Question Result split-pane (warm-cream bg, slate-blue fg, single warm
  orange accent for eyebrows)
- ✅ Auth pages (login + register) redesigned with the same tokens +
  BookOpen brand mark
- ✅ Dark mode toggle in Nav (Sun/Moon icon, localStorage persistence,
  inline-script FOUC-prevention)
- ✅ Delete-book affordance: 3-dot menu in /library with confirm dialog,
  `DELETE /api/books/[id]` cascades + Storage cleanup
- ✅ Question Result retry on 0 matches: `POST /api/question/[id]/retry`
  re-runs relevance and replaces matches in place

**PDF viewer (a small product unto itself)**
- ✅ Zoom controls (50%–300% + Fit width button)
- ✅ Page-jump input + keyboard shortcuts (`+`/`-`/`0` zoom, `g` page jump)
- ✅ Reserved-space page slots (letter aspect ratio fallback) so layout
  doesn't collapse during canvas re-render
- ✅ Lazy-mount via IntersectionObserver (300-page books no longer
  re-render every page on each zoom click)
- ✅ `useDeferredValue` to coalesce rapid zoom clicks → no white-flash
  on load or zoom

---

## Notes for whoever picks this up next

- **CLAUDE.md / AGENTS.md** are the project entry points (CLAUDE.md
  also has Workflow Conventions including "always update CHANGELOG.md
  alongside meaningful changes")
- **`CHANGELOG.md`** = chronological view of features / fixes by version
- **`docs/vibe-reading.md`** = product spec (philosophy + design rules)
- **`docs/vibe-reading-implementation.md`** = tech walkthrough by Phase
- **`docs/ui-design-report.md`** = how the UI is built (tokens, component
  structure, design rules)
- All schema changes go through `Path B` SQL block in
  `vibe-reading-implementation.md` Phase 4A
- Feature flags / A-B testing not set up; if you need them, add Vercel
  Edge Config or Statsig (cheap on free tier)
