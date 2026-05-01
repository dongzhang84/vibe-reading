-- ═══════════════════════════════════════════════════════════════════════════
-- Vibe Reading v2.2 → v2.3 — Per-user storage quota
-- Run this in Supabase Dashboard → SQL Editor → Cmd/Ctrl+Enter
-- Idempotent: safe to run twice (uses IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a size_bytes column on vr.books so we can sum up storage per user
-- and reject uploads that would exceed a hard cap. Existing rows stay NULL
-- and are treated as 0 by the quota math (acceptable undercount for the few
-- pre-quota books; new uploads after this migration write the real size).

alter table vr.books add column if not exists size_bytes bigint;

-- After running, regenerate TypeScript types (optional but recommended):
--   npm run db:types
