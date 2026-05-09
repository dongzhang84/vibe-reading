-- ═══════════════════════════════════════════════════════════════════════════
-- Vibe Reading v2.3 → v2.4 — EPUB format support
-- Run this in Supabase Dashboard → SQL Editor → Cmd/Ctrl+Enter
-- Idempotent: safe to run twice (uses IF NOT EXISTS + DO blocks for the check
-- constraint).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds two columns:
--   1. vr.books.format       — 'pdf' | 'epub'. Existing rows backfill to 'pdf'
--                              via the column default. Future formats (mobi,
--                              txt, html) won't need another migration —
--                              just relax the check constraint.
--   2. vr.chapters.content_html — sanitized HTML for the Read pane on EPUB
--                                 books. PDF chapters leave it null and keep
--                                 using the existing PdfViewer. AI calls
--                                 (intake / relevance / brief) continue to
--                                 read `chapters.content` (plain text) for
--                                 both formats — content_html is purely a
--                                 render concern.
--
-- See docs/epub-support.md for the full feature plan.

alter table vr.books
  add column if not exists format text not null default 'pdf';

-- Add the check constraint separately so we can guard against re-running
-- (alter table ... add constraint has no IF NOT EXISTS form).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'books_format_check'
      and conrelid = 'vr.books'::regclass
  ) then
    alter table vr.books
      add constraint books_format_check
      check (format in ('pdf', 'epub'));
  end if;
end $$;

alter table vr.chapters
  add column if not exists content_html text;

-- After running, regenerate TypeScript types (optional but recommended):
--   npm run db:types
