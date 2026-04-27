# Vibe Reading — TODO

> Living list of things not yet done. Three buckets, ordered roughly by
> "ship-blocker → polish → new edge".
>
> Recommended sequence: **B → A → C**. B is the "before showing strangers"
> safety net; A is closing-time polish; C is product expansion that needs
> time and conviction.
>
> Last updated: 2026-04-26 (post UI overhaul + PDF zoom + flash-fix).

---

## A. Polish (low-effort visible wins)

Each ~15–45 min. None block anything. Pick when you want a clean break.

- [ ] **Auth pages (`/auth/login`, `/auth/register`) UI pass** — currently
      still raw Tailwind from before the Notion-warm overhaul. Apply the
      same tokens (warm bg, slate fg, BookOpen brand glyph, primary pill
      buttons) so they don't feel like a different app
- [ ] **Delete-book affordance on `/library`** — no way to remove a book
      once uploaded. Add a 3-dot menu (or simple "×" on hover) per card →
      confirmation modal → `DELETE /api/books/[id]` route (cascades chapters
      / questions / briefs / restatements; also removes Storage blob)
- [ ] **Dark mode toggle in Nav** — `globals.css` already has full dark
      tokens. Just need a sun/moon button + `localStorage` to persist.
      Nav is the natural place
- [ ] **PDF viewer keyboard shortcuts** — `+` / `−` zoom, `0` reset to 100%,
      `g` open page-jump input. Heavy readers will love it
- [ ] **Question Result empty state** — when relevance AI returns 0 matches
      (rare but happens for nonsense questions), current copy is "AI mapping
      unavailable". Better: `Try again` button + offer to go back to Book
      Home
- [ ] **`/library` book card metadata** — show "Last asked: 'why X?'" so
      returning users land in context. Requires a quick join from
      `vr.questions ORDER BY created_at DESC LIMIT 1` per book

---

## B. Hardening (do BEFORE inviting strangers)

These are the "production safety" gaps. Without them, a single curious user
can run up an OpenAI bill, or you'll find out about prod errors only after
the user complains.

- [ ] **Rate-limit AI endpoints** — `/api/question`, `/api/brief`,
      `/api/ask` have no caps. One signed-in user could `for i in {1..1000}`
      a curl loop and burn $50+ in minutes. Suggested: per-user daily caps
      (e.g. 50 questions, 100 briefs, 200 asks) via Upstash Ratelimit or
      a simple `vr.usage_log` table + check at API entry
- [ ] **Error tracking (Sentry / Highlight / similar)** — only console.error
      right now; prod errors invisible unless we manually check Vercel logs.
      Free tier is fine for an MVP. Hook it into `app/error.tsx` +
      `app/global-error.tsx` + each `/api/*` route's catch block
- [ ] **OpenAI cost ceiling** — set a hard monthly cap on the API key in
      OpenAI dashboard, and a $10 / $25 alert email. Belt + suspenders
      with the rate limit
- [ ] **Basic usage analytics (Posthog / Plausible)** — funnel visibility:
      how many uploaders ever ask a question? how many askers ever click
      Brief or Read? Drives the next product iteration. Posthog free tier
      is enough
- [ ] **Supabase Storage lifecycle audit** — owned books stay in
      `vr-docs` bucket forever. Verify cron is only deleting unowned
      orphans. Consider a future feature: per-user storage quota or
      "archive" flow

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
- [ ] **EPUB / non-PDF support** — programmer books often EPUB; `unpdf`
      can't read them. Need `epub2` or `epubjs` parser, new
      `lib/epub/outline.ts`. Storage path / book row schema can stay the
      same; just fan out by file type at upload time
- [ ] **Share / export Question Result** — turn a great Q+chapter map into
      a public read-only URL or markdown export. Potential viral surface
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

---

## Done (just landed — for context)

Quick reference of what's been shipped recently. Full history in `git log`.

- ✅ v1 → v2 schema migration (drop goals/chapter_maps, add questions /
  question_chapters, alter briefs to chapter_id-only)
- ✅ Question-driven 4-screen flow (Upload → Sign in → Book Home →
  Question Result with split-pane Brief / Read)
- ✅ AI pipeline: intake (overview + 3 starter questions), relevance
  (chapter ranking via `H1`/`H2`/...) handles, briefer (4-part), asker
  (passage-level). All `gpt-4o-mini` + JSON schema strict
- ✅ Auth flow: Google OAuth + Email/Password, with claim on every login
  path (callback inline + Email path explicit + defensive in /b/[id] +
  /library)
- ✅ Site-wide Nav (sticky, auth-aware, pathname self-hide)
- ✅ Notion-warm UI overhaul across landing, /library, Book Home, and
  Question Result split-pane
- ✅ PDF viewer: zoom controls (50%–300% + Fit width), reserved-space
  page slots, lazy-mount via IntersectionObserver, `useDeferredValue`
  to coalesce rapid zoom clicks → no white-flash on load or zoom

---

## Notes for whoever picks this up next

- **CLAUDE.md / AGENTS.md** are the project entry points
- **`docs/vibe-reading.md`** = product spec (philosophy + design rules)
- **`docs/vibe-reading-implementation.md`** = tech walkthrough by Phase
- **`docs/ui-design-report.md`** = how the UI is built (tokens, component
  structure, design rules)
- All schema changes go through `Path B` SQL block in
  `vibe-reading-implementation.md` Phase 2
- Feature flags / A-B testing not set up; if you need them, add Vercel
  Edge Config or Statsig (cheap on free tier)
