# Vibe Reading — Implementation Guide

**Product**: Vibe Reading
**Tagline**: A reading tool that refuses to summarize the book before you tell it why you're reading it.
**Stack**: Next.js 16 App Router + TypeScript + Tailwind + Shadcn/ui + Supabase (Supabase-only, no Prisma) + OpenAI + Vercel
**Repo**: `github.com/dongzhang84/vibe-reading`
**Last Updated**: 2026-04-24 (v2 redesign — question-driven flow)

> 单一 source of truth。按 Phase 顺序执行，不跳步。标准模块部分严格遵循 `stack/STANDARD.md`，业务逻辑部分在每个 Phase 内定制。
> **No Stripe**：这是开源项目，MVP 全免费。
> **No Prisma**：STANDARD.md §4.6 的 Supabase-only 方案。
> **v2 重设计（2026-04-24）**：5 屏 goal-driven 流改成 4 屏 question-driven。老 Map/Brief/Restate 分页合并为 Question Result 的左右分屏。Restate 代码保留，UI 入口在 v1 隐藏（v1.1 回归）。

---

## ⚠️ Golden Rules

四条哲学铁律。与 `docs/vibe-reading.md` §The 4 Design Rules 严格一一对应。写代码过程不能妥协，review 时反复对照。

**Rule 1** — AI 不能在用户表达需求之前输出任何**关于章节内容**的东西。
- Upload 之后可以展示 TOC、生成 book overview 和推荐问题（这些是书的**元信息**，不是内容压缩）
- 但**必须先有用户提交的 question** 才能触发任何章节级的 relevance 映射或 brief
- 所有 AI 端点（`/api/question` / `/api/brief` / `/api/ask`）第一步必须确认 `questions.book_id` 存在（brief/ask 还要确认 chapter 属于这本书）

**Rule 2** — Question Result 的相关章节匹配只做映射，不做内容。
- `lib/ai/relevance.ts` prompt 严格禁止总结章节
- 输出 reason 字段只能说 "likely contains X" / "discusses Y"，不能说 "the author argues Z"
- 章节的实际内容必须等用户点 [Brief] 或 [Read] 才触发

**Rule 3** — Brief 模式输出严格 4 段式结构。
- 1-sentence version + 3 key claims + 1 example + what author doesn't address
- OpenAI JSON schema strict 约束，不允许散文
- 前端按 4 段式渲染，超出 schema 字段丢弃

**Rule 4 (Deferred to v1.1)** — 老版本要求 Brief 后强制接复述屏，不允许跳过。
- 产品转向问题驱动后，"复述章节" 作为强制 gate 不再契合（用户问了一个问题期待的是答案 + 章节，不是又一个写作任务）
- 复述的**代码 / 表 / API 全部保留**（`vr.restatements` 表、`/api/check`、`lib/ai/checker.ts`、`components/RestateScreen.tsx`），UI 入口在 v1 不可见
- v1.1 回归时作为「AI-assisted active reading」feature 重做

---

## Technical Pipeline Overview

整个 v2 系统拆成 4 条独立的技术 pipeline，下面这张图给一个鸟瞰。先看图建立全局心智模型，再往下读 Phase 0-13 的细节实现。

![Vibe Reading technical pipeline](../diagram/tech-pipeline/diagram.svg)

**4 条 pipeline 与 Phase 的对应关系**：

| Pipeline | 何时触发 | 涉及的 Phase | LLM 调用形态 |
|---|---|---|---|
| **A · Intake** | 用户上传一本新书 | Phase 4（Upload + intake AI） | 1 次 / 本书 |
| **B · Question** | 用户在 Book Home 提交一个问题 | Phase 5 + Phase 6 | 1 次 / 问题（~3s） |
| **C · Brief** | 用户在 Question Result 左栏点 [Brief] | Phase 8 | 1 次 / 章节，cache 永久 |
| **D · Read** | 用户在 Question Result 左栏点 [Read]（含可选的 Highlight & Ask） | Phase 10 | 0–N 次 / 高亮 |

**核心选型**：所有 LLM 调用都走 OpenAI `gpt-4o-mini` + JSON schema strict 模式。**没有 vector DB、没有 embeddings、没有 RAG 框架**——只有 `pdfjs` 抽结构 + 4 类 narrow LLM call。详细 prompt 设计在各 Phase 内。

---

## Phase 0 — 项目初始化

### Step 1: Scaffold

```bash
npx create-next-app@latest vibe-reading --typescript --tailwind --app
cd vibe-reading
npx shadcn@latest init
npm install @supabase/supabase-js @supabase/ssr unpdf react-pdf openai
npm install -D supabase
```

### Step 2: Supabase 配置

**按 STANDARD §3.7 Supabase Setup Checklist 执行**，Vibe Reading 偏离：

- **复用 launchradar 的 Supabase project** —— 不新建。凭据从 `/Users/dong/Projects/launchradar/.env.local` 复制
- **Schema**：`vr`（2-letter 前缀约定）
- **Auth**：launchradar 已配好 Email + Google
- **Storage bucket**：`vr-docs`（Phase 4 实现上传时再建，不做 `pdfs` 因为留空间给未来非 PDF 文档）
- **跳过的 provider**：GitHub OAuth / Magic Link / 其他

### Step 3: 目录结构（v2）

```
vibe-reading/
├── app/
│   ├── api/
│   │   ├── upload/route.ts            ← PDF 解析 + intake (overview + 3 questions)
│   │   ├── question/route.ts          ← 提交 question → 触发 relevance → 写 question_chapters
│   │   ├── brief/route.ts             ← [Brief] 触发点（chapter-level，缓存）
│   │   ├── ask/route.ts               ← [Read] pane 里的 Highlight & Ask
│   │   ├── check/route.ts             ← ⚠️ Reserved v1.1（UI 不调用）
│   │   ├── claim/route.ts             ← session → user 迁移（登录前上传的书归属）
│   │   └── cron/cleanup/route.ts      ← 24h 未认领 session book 清理
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── callback/route.ts
│   ├── b/[bookId]/
│   │   ├── page.tsx                   ← Screen 2: Book Home
│   │   └── q/[questionId]/page.tsx    ← Screen 3: Question Result (分屏)
│   ├── library/page.tsx
│   ├── page.tsx                       ← Screen 1 (Landing + Upload)
│   └── layout.tsx
├── components/
│   ├── UploadDropzone.tsx
│   ├── LoginModal.tsx
│   ├── BookHomeScreen.tsx             ← TOC + question input + suggestions + history
│   ├── QuestionResultScreen.tsx       ← 左右分屏容器
│   ├── ChapterListPane.tsx            ← 左栏：AI matched chapters + [Brief]/[Read] 按钮
│   ├── BriefPane.tsx                  ← 右栏 Brief 内容
│   ├── ReadPane.tsx                   ← 右栏 PDF viewer + Highlight & Ask
│   ├── PdfViewer.tsx                  ← react-pdf 封装
│   ├── RestateScreen.tsx              ← ⚠️ Reserved v1.1（文件保留不挂路由）
│   └── ui/...
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── pdf/
│   │   ├── outline.ts                 ← pdfjs.getOutline() 抽 TOC 树
│   │   └── parser.ts                  ← 全文抽取 + 章节 fallback 切分
│   ├── ai/
│   │   ├── intake.ts                  ← overview + 3 questions（一次 LLM 调用）
│   │   ├── relevance.ts               ← question → chapter 匹配 (取代老 mapper.ts)
│   │   ├── briefer.ts                 ← Brief 4 段式
│   │   ├── asker.ts                   ← Read pane 的 highlight & ask
│   │   └── checker.ts                 ← ⚠️ Reserved v1.1
│   ├── auth/claim.ts                  ← session → user book 迁移 helper
│   └── session.ts                     ← pre-login session cookie 工具
├── types/
│   ├── index.ts                       ← TocEntry / QuestionMatch 等业务类型
│   └── db.ts                          ← supabase gen types 输出
├── middleware.ts
├── vercel.json
└── .env.local
```

### Step 4: 环境变量

`.env.local`：

```bash
# Supabase (shared with launchradar; isolated by schema `vr`)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron
CRON_SECRET=
```

> 没有 `DATABASE_URL`（Supabase-only）。没有 Stripe。

### Step 5: Supabase TypeScript 类型自动生成

```bash
npx supabase login
npx supabase gen types typescript --project-id myvtqxfcwzrntepcfvkn --schema vr > types/db.ts
```

`package.json`：

```json
"scripts": {
  "db:types": "supabase gen types typescript --project-id myvtqxfcwzrntepcfvkn --schema vr > types/db.ts"
}
```

每次改 schema 后跑 `npm run db:types`。

---

## Phase 1 — Landing + Upload (Screen 1) + 壳

产品第一印象屏。打开 5 秒内读者要理解：**这个工具不一样，它拒绝偷懒**。

### 1.0 壳基础

按 STANDARD §2.5 Scaffold 清理执行。本项目定制：
- Monogram 用 **V 字形**（`path d="M9.5 9.5 L16 22.5 L22.5 9.5"`）
- metadata 的 title / description 用本文顶部 Product / Tagline

### 1.1 页面结构（`app/page.tsx`）

```
<main>
  <Hero>
    <h1>Vibe Reading</h1>
    <p>A reading tool that refuses to summarize the book
       before you tell it why you're reading it.</p>

    <UploadDropzone />

    <small>Vibe Reading is different.
      We won't summarize your book until you tell us why
      you're reading it. This is not a bug.</small>
  </Hero>

  <Philosophy>
    <p>The bottleneck of learning is not information transfer,
       but information compression. AI cannot do the compression
       for you — compression must happen in your brain, using
       your existing cognition as hooks.</p>
  </Philosophy>
</main>
```

- 全英文 UI
- **不**放 "Sign in" 按钮在顶部 nav（避免 "登录解锁什么" 的焦虑；登录时机由 upload 后触发）
- 极简，除 ✅❌⚠️ 三个功能性 emoji 外不加装饰

### 1.2 Upload Dropzone（`components/UploadDropzone.tsx`）

```tsx
'use client'
import { useState } from 'react'

export function UploadDropzone() {
  const [state, setState] = useState<'idle' | 'uploading' | 'parsing'>('idle')

  async function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) { alert('Max 50MB'); return }
    if (file.type !== 'application/pdf') { alert('PDF only'); return }

    setState('uploading')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Upload failed' }))
      alert(error); setState('idle'); return
    }
    setState('parsing')
    const { bookId } = await res.json()
    // v2: upload 之后立刻走登录 + Book Home (不再是 /goal)
    // 若已登录 → 直接 /b/[id]；若未登录 → /auth/login?next=/b/[id]（LoginModal 会接管）
    window.location.href = `/b/${bookId}`
  }

  return (/* drop UI + file input fallback + progress */)
}
```

### 1.3 Session Cookie 工具（`lib/session.ts`）

Upload API 仍然接受未登录上传（UX 考虑：drop → 立即开始解析 + 并行弹登录，避免先挡 login 再开始上传）。登录前用 session cookie 识别。

```typescript
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'vr-session'

export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(COOKIE_NAME)?.value
  if (existing) return existing
  const sid = crypto.randomUUID()
  jar.set(COOKIE_NAME, sid, {
    httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/',
  })
  return sid
}

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}
```

> **v2 设计决策**：保留 session-cookie 机制。用户的 journey 是：drop PDF → 并行（后端解析 + 前端弹登录 modal）→ 登录成功 → claim session book → /b/[id]。这样 drop 时不打断，登录时 book 已经 ready。比"先挡 login 再 upload"UX 好。

---

## Phase 2 — 数据库 Schema (v2)

**在 Supabase Dashboard → SQL Editor 跑 SQL。下面有两条互斥路径，按你的状态选 ONE：**

| 你的状态 | 跑哪段 |
|---|---|
| 全新 DB，没有 vr schema | **Path A** —— 完整建表脚本 |
| 已有 v1 schema（goals / chapter_maps / 旧 briefs / 老书数据） | **Path B** —— 升级迁移脚本 |

**约定（遵循 STANDARD.md §4.1）**：
- 所有表放在 `vr` schema
- 所有表 RLS ENABLED + owner-based policies（Layer 2 防御）
- API route 第一行仍必须验证 auth（Layer 1）
- 后端 admin client 用 service_role key 绕过 RLS

---

### Path A — Fresh install（没有 vr schema 时用）

```sql
-- 重置：线下/测试用
-- drop schema if exists vr cascade;

create schema if not exists vr;

-- Grants
grant usage on schema vr to service_role, authenticated;
alter default privileges in schema vr grant all on tables to service_role;
alter default privileges in schema vr grant all on sequences to service_role;
alter default privileges in schema vr grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema vr grant usage, select on sequences to authenticated;

-- ─── books ─────────────────────────────────────────────────────────────────
-- v2: 新加 toc / overview / suggested_questions 三列（元信息，upload 时由 AI 填）
create table vr.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  session_id text,
  title text not null,
  author text,
  storage_path text not null,
  page_count int,
  toc jsonb,                                -- TocEntry[] (flatten tree)
  overview text,                            -- 80-120 词客观概述
  suggested_questions jsonb,                -- string[3]
  created_at timestamptz default now()
);
create index on vr.books (owner_id);
create index on vr.books (session_id);
alter table vr.books enable row level security;
create policy "own books read"   on vr.books for select using (auth.uid() = owner_id);
create policy "own books insert" on vr.books for insert with check (auth.uid() = owner_id);
create policy "own books update" on vr.books for update using (auth.uid() = owner_id);
create policy "own books delete" on vr.books for delete using (auth.uid() = owner_id);

-- ─── chapters ──────────────────────────────────────────────────────────────
-- v2: 加 page_start / page_end（Read pane 要跳页）+ level（TOC 层级）
create table vr.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  seq int not null,
  title text not null,
  content text not null,
  page_start int,
  page_end int,
  level int default 1                       -- 1=top chapter, 2+=subsection
);
create index on vr.chapters (book_id, seq);
alter table vr.chapters enable row level security;
create policy "own chapters" on vr.chapters for all
  using (book_id in (select id from vr.books where owner_id = auth.uid()))
  with check (book_id in (select id from vr.books where owner_id = auth.uid()));

-- ─── questions (v2 NEW) ───────────────────────────────────────────────────
-- 用户在 Book Home 提的问题。一本书可以有多个 question。
create table vr.questions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);
create index on vr.questions (book_id, created_at desc);
create index on vr.questions (user_id);
alter table vr.questions enable row level security;
create policy "own questions" on vr.questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── question_chapters (v2 NEW) ───────────────────────────────────────────
-- AI 产出的 question → chapter 映射 + 一句话理由。缓存永久，没 TTL。
create table vr.question_chapters (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references vr.questions(id) on delete cascade,
  chapter_id uuid references vr.chapters(id) on delete cascade,
  -- chapter_id 可为 null 表示 book-level reason（meta 问题，弥散在全书）
  reason text not null,                     -- "likely contains X" / "discusses Y"
  rank int not null,                        -- 1 = most relevant
  created_at timestamptz default now(),
  unique (question_id, chapter_id)
);
create index on vr.question_chapters (question_id, rank);
alter table vr.question_chapters enable row level security;
create policy "own question_chapters" on vr.question_chapters for all
  using (question_id in (select id from vr.questions where user_id = auth.uid()))
  with check (question_id in (select id from vr.questions where user_id = auth.uid()));

-- ─── briefs (v2 CHANGED) ──────────────────────────────────────────────────
-- v1 的 unique 是 (chapter_id, goal_id)。v2 Brief 是章节级客观内容，
-- 不再绑 question/goal。改成 unique (chapter_id)。
create table vr.briefs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  one_sentence text not null,
  key_claims jsonb not null,                -- string[3]
  example text not null,
  not_addressed text not null,
  created_at timestamptz default now(),
  unique (chapter_id)
);
alter table vr.briefs enable row level security;
create policy "own briefs" on vr.briefs for all
  using (chapter_id in (
    select c.id from vr.chapters c
    join vr.books b on b.id = c.book_id
    where b.owner_id = auth.uid()
  ))
  with check (chapter_id in (
    select c.id from vr.chapters c
    join vr.books b on b.id = c.book_id
    where b.owner_id = auth.uid()
  ));

-- ─── restatements (⚠️ Reserved for v1.1) ──────────────────────────────────
-- 表保留，schema 不动。v1 UI 不写入也不读，代码路径 /api/check 可调用但无入口。
create table vr.restatements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  got_right jsonb not null,
  missed jsonb not null,                    -- v1 末期改为 "angles" 段落存在 missed[0]
  follow_up text,
  created_at timestamptz default now()
);
create index on vr.restatements (user_id, chapter_id);
alter table vr.restatements enable row level security;
create policy "own restatements read"   on vr.restatements for select using (auth.uid() = user_id);
create policy "own restatements insert" on vr.restatements for insert with check (auth.uid() = user_id);
create policy "own restatements update" on vr.restatements for update using (auth.uid() = user_id);
create policy "own restatements delete" on vr.restatements for delete using (auth.uid() = user_id);

-- 再保险一次
grant all on all tables in schema vr to service_role;
grant all on all sequences in schema vr to service_role;
grant select, insert, update, delete on all tables in schema vr to authenticated;
```

---

### Path B — v1 → v2 upgrade（已有 v1 schema 时用）

**这段 SQL 是完整的 —— 粘贴一次跑完，不用再去看 Path A**：

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Vibe Reading v1 → v2 schema migration (single block, runnable as-is)
-- 在 Supabase Dashboard → SQL Editor 粘贴 → Cmd/Ctrl+Enter
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. books 加 v2 列
alter table vr.books add column if not exists toc jsonb;
alter table vr.books add column if not exists overview text;
alter table vr.books add column if not exists suggested_questions jsonb;

-- 2. chapters 加 level
alter table vr.chapters add column if not exists level int default 1;

-- 3. drop 老表（cascade 自动清依赖行：briefs.goal_id / chapter_maps.goal_id）
drop table if exists vr.chapter_maps cascade;
drop table if exists vr.goals cascade;
drop table if exists vr.briefs cascade;        -- 老 briefs 用 (chapter_id, goal_id)，要全清重建

-- 4. NEW: questions
create table vr.questions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);
create index on vr.questions (book_id, created_at desc);
create index on vr.questions (user_id);
alter table vr.questions enable row level security;
create policy "own questions" on vr.questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. NEW: question_chapters
create table vr.question_chapters (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references vr.questions(id) on delete cascade,
  chapter_id uuid references vr.chapters(id) on delete cascade,    -- nullable for book-level
  reason text not null,
  rank int not null,
  created_at timestamptz default now(),
  unique (question_id, chapter_id)
);
create index on vr.question_chapters (question_id, rank);
alter table vr.question_chapters enable row level security;
create policy "own question_chapters" on vr.question_chapters for all
  using (question_id in (select id from vr.questions where user_id = auth.uid()))
  with check (question_id in (select id from vr.questions where user_id = auth.uid()));

-- 6. RECREATE: briefs (v2 unique 改成 chapter_id，drop 老 goal_id 列)
create table vr.briefs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  one_sentence text not null,
  key_claims jsonb not null,
  example text not null,
  not_addressed text not null,
  created_at timestamptz default now(),
  unique (chapter_id)
);
alter table vr.briefs enable row level security;
create policy "own briefs" on vr.briefs for all
  using (chapter_id in (
    select c.id from vr.chapters c
    join vr.books b on b.id = c.book_id
    where b.owner_id = auth.uid()
  ))
  with check (chapter_id in (
    select c.id from vr.chapters c
    join vr.books b on b.id = c.book_id
    where b.owner_id = auth.uid()
  ));

-- 7. 再保险 grants
grant all on all tables in schema vr to service_role;
grant all on all sequences in schema vr to service_role;
grant select, insert, update, delete on all tables in schema vr to authenticated;
```

**Path B 跑完后再单独跑这段，清掉 v1 的老书数据**（老 books 的 toc/overview/suggested_questions 是 null，新代码渲染会很尴尬；最简单删了让用户重传）：

```sql
-- chapters / restatements / questions / question_chapters / briefs
-- 都靠 books cascade 自动清
delete from vr.books;
```

⚠️ **Storage 里的老 PDF 文件 SQL 删不掉**，要去 Supabase Dashboard → Storage → `vr-docs` bucket → 全选 → Delete 手动清。

---

### 跑完 SQL 后（两条 path 共同步骤）

1. STANDARD §3.7.3 把 `vr` 加到 Exposed Schemas（Path A 首次配置时；Path B 一般之前已加过）
2. STANDARD §3.7.5 探针脚本验证（service_role ✅ / anon blocked）
3. `npm run db:types` 生成类型

---

## Phase 3 — Auth（Email/Password + Google）

照 STANDARD.md §3 复制 `lib/supabase/{client,server,admin}.ts` / `callback/route.ts` / `middleware.ts`。**偏离**：

### Ownership at a glance

| Step | Owner | Time |
|---|---|---|
| 写 `lib/supabase/{client,server,admin}.ts` 带 `<Database, 'vr'>` + `db: { schema: 'vr' }` | 🤖 | 2 min |
| 写 `middleware.ts`（保护 `/library` + 整个 `/b/*`）| 🤖 | 2 min |
| 写 `/auth/{login,register,callback}` + `components/LoginModal.tsx` | 🤖 | 8 min |
| Google Cloud Console → 建 OAuth Client + redirect URI | 🙋 | 3 min |
| Supabase Dashboard → 开 Google + 粘 Client ID/Secret | 🙋 | 2 min |
| 端到端实测 4 条路径 | 🙋 | 5 min |

### 3.0 所有 createClient 必须指定 schema + Database 泛型

```typescript
import type { Database } from '@/types/db'

createBrowserClient<Database, 'vr'>(url, key, { db: { schema: 'vr' } })
createServerClient<Database, 'vr'>(url, key, { cookies: {...}, db: { schema: 'vr' } })
createClient<Database, 'vr'>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'vr' },
})
```

### 3.1 砍掉 GitHub

STANDARD §3.2 login 页里的 GitHub **不要**。只保留 Email/Password + Google。

### 3.2 Middleware 路由保护（v2 改动）

```typescript
// v2: Book Home + Question Result 都要登录（整个 /b/* 都保护）
const PROTECTED_ROUTES = ['/library']
const BOOK_ROUTES = /^\/b\/[^/]+/   // /b/:id 和 /b/:id/q/:qid 都要登录
```

**与 v1 区别**：v1 里 `/b/:id/goal` 和 `/b/:id/map` 是公开的（登录点在 Map → Brief 之间）。v2 里整个 `/b/*` 都挡 —— 登录时机前置到 Upload → Book Home 之间。

### 3.3 不创建 Profile 表

Vibe Reading schema 没有 Profile 表 —— 用户信息直接用 `auth.users`。STANDARD §3.3 的 upsert Profile 代码不要复制。

### 3.4 Login Modal（不是 full page）

Upload 成功后如果未登录：在 landing 上弹 LoginModal，回调 `?next=/b/:id`。登录成功 → callback 内联 claim → 跳 `/b/:id`。

**文案必须写清楚"登录 = 创建账号"**（STANDARD §3.2 UX 铁律）：
1. Subtitle: `Sign in, or create an account — same modal. This is the only time we'll ask.`
2. Google 按钮下方: `First time? Continue with Google creates your account automatically.`
3. 底部: `No account yet? [Sign up with email →](/auth/register?next=<same returnTo>)`

### 3.5 Callback 支持 next 参数

`/auth/callback` 读 `?next=`，`exchangeCodeForSession` 成功后跳。防开放重定向：只接受 `/` 开头且不以 `//` 开头的同源路径。

### 3.6 登录后 Session → User 迁移

callback 内联 claim（见 Phase 7）。`/api/claim` 作为 email 登录 path 的兜底。

---

## Phase 4 — PDF 解析 + TOC + Intake AI (v2 重写)

v2 的关键变化：
- 抓目录用 **`pdfjs.getOutline()`**（unpdf 暴露 pdfjs proxy，直接调原生 API）
- Upload API 一次性做完：**解析 PDF + 切章 + 生成 overview + 生成 3 推荐问题**
- 老的正则切章逻辑降级为 fallback（PDF 无 outline metadata 时才用）

**Storage bucket**：`vr-docs`（私有、50MB、`application/pdf` MIME 白名单）。

### 4.1 PDF Outline 抽取（`lib/pdf/outline.ts`）

```typescript
import 'server-only'
import { getDocumentProxy } from 'unpdf'

export interface TocEntry {
  title: string
  level: number          // 1 = top chapter, 2+ = subsection
  page: number           // 1-indexed
}

/**
 * 从 PDF 的嵌入 outline 抽 TOC 树，flatten 成带 level 的列表。
 * 返回 null 表示 PDF 没有 outline —— 调用方走 fallback (lib/pdf/parser.ts 的 splitIntoChapters)。
 */
export async function extractOutline(buffer: Buffer): Promise<TocEntry[] | null> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const outline = await pdf.getOutline()
    if (!outline || outline.length === 0) return null

    const entries: TocEntry[] = []
    async function walk(nodes: any[], level: number) {
      for (const node of nodes) {
        const page = await resolvePage(pdf, node.dest)
        if (page !== null) {
          entries.push({ title: node.title.trim(), level, page })
        }
        if (node.items?.length) await walk(node.items, level + 1)
      }
    }
    await walk(outline, 1)
    return entries.length ? entries : null
  } finally {
    await pdf.destroy()
  }
}

async function resolvePage(pdf: any, dest: any): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!explicit) return null
    const pageIndex = await pdf.getPageIndex(explicit[0])
    return pageIndex + 1
  } catch {
    return null
  }
}
```

**已在 Kuhn 《科学革命的结构》 实测通过**：getOutline 正确返回 9 章 + 每章子节，页码解析准确。

### 4.2 PDF 全文 + 章节切分（`lib/pdf/parser.ts`）

老代码沿用。修改点：

- 加一个新 API `extractChaptersWithOutline(buffer, toc: TocEntry[])` —— 给每个 top-level TOC entry 切出 `{ title, content, page_start, page_end }`
- 老的 `splitIntoChapters(fullText)` 作为 fallback，保留代码

```typescript
// 高层入口（Upload API 调用）
export async function parseBookStructure(buffer: Buffer): Promise<ParsedBook> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const [{ info }, { totalPages }] = await Promise.all([getMeta(pdf), extractText(pdf)])
    const toc = await extractOutline(buffer)

    let chapters: RawChapter[]
    if (toc && toc.length >= 3) {
      // 主路径：按 outline 页码切
      chapters = await sliceByOutline(pdf, toc, totalPages)
    } else {
      // Fallback: 老正则 v2
      const { text } = await extractText(pdf, { mergePages: true })
      chapters = splitIntoChaptersRegex(text as string)
    }

    return {
      title: cleanStr(info?.Title) ?? 'Untitled',
      author: cleanStr(info?.Author) ?? null,
      pageCount: totalPages,
      toc: toc ?? null,
      chapters,
    }
  } finally {
    await pdf.destroy()
  }
}
```

`sliceByOutline`：按 top-level entry 的页码区间，逐页 `pdf.getPage(n).getTextContent()` 拼接正文。子节（level>=2）不单独建 chapter，但保存在 books.toc 里供 Book Home 渲染层级。

### 4.3 Intake AI（`lib/ai/intake.ts`）

一次 LLM 调用，同时产出 overview + 3 推荐问题。

```typescript
import 'server-only'
import OpenAI from 'openai'

const INTAKE_SCHEMA = {
  type: 'object',
  required: ['overview', 'questions'],
  additionalProperties: false,
  properties: {
    overview: { type: 'string', maxLength: 800 },
    questions: {
      type: 'array',
      minItems: 3, maxItems: 3,
      items: { type: 'string', maxLength: 160 },
    },
  },
} as const

export interface IntakeInput {
  title: string
  author: string | null
  tocTitles: string[]              // flatten 的 TOC 标题（level 1 为主）
  intro: string                    // 前 ~2000 字
  conclusion: string               // 末 ~2000 字
}

export interface IntakeResult {
  overview: string
  questions: [string, string, string]
}

export async function analyzeBook(input: IntakeInput): Promise<IntakeResult> {
  const prompt = `Given a non-fiction book, produce an overview and 3 starter questions.

BOOK:
Title: ${input.title}
Author: ${input.author ?? 'Unknown'}

TABLE OF CONTENTS:
${input.tocTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

INTRODUCTION (first ~2000 chars):
${input.intro.slice(0, 2000)}

CONCLUSION (last ~2000 chars):
${input.conclusion.slice(0, 2000)}

Output two fields:

1. overview: 80-120 words, OBJECTIVE description of what this book is about.
   No evaluation. Not a summary — an orientation. Avoid the word "summary".
   Describe the subject, the angle, and who the book is for.

2. questions: EXACTLY 3 questions a thoughtful reader might bring when picking
   up this book. Cover these three angles, one each:
     (a) Claim-level — "what is this book actually arguing?"
     (b) Stakes — "why does this book matter / how does it compare to X?"
     (c) Concrete — a specific concept/chapter-level question using a real term
         from this book's TOC

Each question under 100 characters. Questions should be the ones a skeptical
reader would actually type, NOT generic "What is [topic]?". Pull specific
vocabulary from the TOC and intro to make them this-book-specific.

Return ONLY JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'intake', strict: true, schema: INTAKE_SCHEMA },
    },
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  })

  return JSON.parse(response.choices[0]?.message?.content ?? '{}') as IntakeResult
}

let client: OpenAI | null = null
function openai() { if (!client) client = new OpenAI(); return client }
```

### 4.4 Upload API（`app/api/upload/route.ts`）

关键点：

- `runtime = 'nodejs'` + `maxDuration = 60`
- Validate: `application/pdf`, ≤ 50 MB
- 流程：upload to Storage → parseBookStructure → write books row (with toc + chapter_count) → write chapters → 异步或同步调 `analyzeBook` → update books.overview + suggested_questions → 返回 bookId
- 错误路径最优努力回滚（Storage blob、books row、chapters row）
- `analyzeBook` 的失败不应阻断上传成功 —— 没 overview/questions 时 Book Home 仍可工作（只是没推荐问题）

> **为什么 intake 同步跑**：reader UX 要求进入 Book Home 就看到推荐问题，不能 "parsing..." spin 10 秒再 spin 5 秒。同步跑总时长 ~8-15 秒，给 dropzone 显示 "Analyzing your book..." progress 即可。

### 4.5 Admin Client（`lib/supabase/admin.ts`）

照 STANDARD §3.1。service_role key，绕过 RLS。

---

## Phase 5 — Screen 2: Book Home（v2 NEW，取代 Goal 输入）

这是 v2 的价值兑现点：用户上传之后**第一眼**看到的就是 TOC + 推荐问题 + 输入框。

### 5.1 页面（`app/b/[bookId]/page.tsx`）

Server component 加载 book 数据 + 历史 questions，传给 client component。

```tsx
// app/b/[bookId]/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookHomeScreen } from '@/components/BookHomeScreen'

export default async function BookHomePage({
  params,
}: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}`)

  const db = createAdminClient()
  const { data: book } = await db.from('books')
    .select('id, owner_id, title, author, toc, overview, suggested_questions')
    .eq('id', bookId).single()
  if (!book || book.owner_id !== user.id) redirect('/library')

  const { data: questions } = await db.from('questions')
    .select('id, text, created_at')
    .eq('book_id', bookId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return <BookHomeScreen book={book} questionHistory={questions ?? []} />
}
```

### 5.2 BookHomeScreen 组件结构

```tsx
// components/BookHomeScreen.tsx
'use client'

export function BookHomeScreen({ book, questionHistory }: Props) {
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(text: string) {
    if (submitting || text.trim().length < 3) return
    setSubmitting(true)
    const res = await fetch('/api/question', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId: book.id, text: text.trim() }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      alert(error); setSubmitting(false); return
    }
    const { questionId } = await res.json()
    window.location.href = `/b/${book.id}/q/${questionId}`
  }

  return (
    <main>
      <header>
        <h1>{book.title}</h1>
        {book.author && <p>by {book.author}</p>}
      </header>

      {book.overview && (
        <section className="overview">
          <p>{book.overview}</p>
        </section>
      )}

      <section className="ask">
        <h2>What do you want to know?</h2>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this book..."
          rows={2}
        />
        <button onClick={() => submit(question)} disabled={submitting}>
          Ask →
        </button>

        {book.suggested_questions && (
          <div className="suggestions">
            <p>Or try one of these:</p>
            {(book.suggested_questions as string[]).map((q) => (
              <button key={q} onClick={() => submit(q)} disabled={submitting}>
                {q}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="toc">
        <h2>Contents</h2>
        {(book.toc as TocEntry[] | null)?.map((entry, i) => (
          <div key={i} style={{ paddingLeft: (entry.level - 1) * 16 }}>
            {entry.title} <span className="page">p.{entry.page}</span>
          </div>
        )) ?? <p>TOC unavailable</p>}
      </section>

      {questionHistory.length > 0 && (
        <section className="history">
          <h2>Your questions</h2>
          {questionHistory.map((q) => (
            <Link key={q.id} href={`/b/${book.id}/q/${q.id}`}>
              {q.text}
            </Link>
          ))}
        </section>
      )}
    </main>
  )
}
```

### 5.3 POST /api/question（`app/api/question/route.ts`）

```typescript
export async function POST(request: Request) {
  const { bookId, text } = await request.json()
  if (typeof text !== 'string' || text.trim().length < 3) {
    return NextResponse.json({ error: 'Question too short' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: book } = await db.from('books')
    .select('id, owner_id, toc').eq('id', bookId).single()
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 创建 question
  const { data: question, error } = await db.from('questions')
    .insert({ book_id: bookId, user_id: user.id, text: text.trim() })
    .select('id').single()
  if (error || !question) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  // 跑 relevance AI（同步，~2-4 秒）
  try {
    const { data: chapters } = await db.from('chapters')
      .select('id, seq, title, content, page_start, level')
      .eq('book_id', bookId)
      .order('seq')

    const { matchChapters } = await import('@/lib/ai/relevance')
    const matches = await matchChapters({
      question: text.trim(),
      toc: book.toc as TocEntry[] | null,
      chapters: (chapters ?? []).map((c) => ({
        id: c.id, seq: c.seq, title: c.title, level: c.level,
        firstParagraph: c.content.slice(0, 600),
      })),
    })

    if (matches.length > 0) {
      await db.from('question_chapters').insert(
        matches.map((m, i) => ({
          question_id: question.id,
          chapter_id: m.chapterId,   // 可为 null (book-level)
          reason: m.reason,
          rank: i + 1,
        })),
      )
    }
  } catch (err) {
    console.error('relevance failed', err)
    // 不阻断：前端拿到 questionId 后仍可展示 question，question_chapters 为空时显示 fallback
  }

  return NextResponse.json({ questionId: question.id })
}
```

**Rule 1 强制**：`/api/question` 是唯一能触发 question_chapters 写入的端点。`/api/brief` / `/api/ask` 第一步都验 chapter 属于 question owner 的书 + 这本书至少有一个 question（"用户已表达过需求"的硬标志）。

---

## Phase 6 — Screen 3: Question Result + 分屏 (v2 NEW，取代 Map)

左栏：AI 匹配的章节列表；右栏：点击 [Brief] / [Read] 后加载的内容。

### 6.1 AI Relevance（`lib/ai/relevance.ts`）

```typescript
import 'server-only'
import OpenAI from 'openai'

const RELEVANCE_SCHEMA = {
  type: 'object',
  required: ['matches'],
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        required: ['chapter_id', 'reason'],
        additionalProperties: false,
        properties: {
          chapter_id: { type: ['string', 'null'] },     // null = book-level
          reason: { type: 'string', maxLength: 280 },
        },
      },
    },
  },
} as const

export interface RelevanceInput {
  question: string
  toc: TocEntry[] | null
  chapters: Array<{
    id: string
    seq: number
    title: string
    level: number
    firstParagraph: string
  }>
}

export interface ChapterMatch {
  chapterId: string | null   // null = 全书级（meta 问题）
  reason: string
}

export async function matchChapters(input: RelevanceInput): Promise<ChapterMatch[]> {
  const chapters = input.chapters.filter((c) => c.level <= 1)   // 只对 top chapter 做映射

  const prompt = `A reader is asking a question about a book. Identify which chapters are most likely to answer the question.

QUESTION:
"${input.question}"

CHAPTERS (id, title, first paragraph):
${chapters
  .map((c) => `[id: ${c.id}] Chapter ${c.seq}: ${c.title}\n${c.firstParagraph}`)
  .join('\n\n---\n\n')}

For each of UP TO 5 chapters that seem relevant, return:
- chapter_id: the id above (exactly as shown, no modifications)
- reason: ONE SENTENCE describing what the chapter LIKELY CONTAINS related to
  the question. Use "likely contains", "discusses", "covers", "introduces".
  NEVER summarize what the author argues, proves, or concludes.

If the question is META (asks about the book as a whole: "what is this book
about", "why does this book matter", "how does it compare to X"), return
ONE entry with chapter_id=null and a reason pointing to the intro + conclusion
as the answer source ("This is a book-level question — the intro and conclusion
together carry the core framing").

Rank by relevance. Most relevant first. If fewer than 3 chapters are truly
relevant, return fewer — do not pad.

BAD reasons (NEVER do this):
- "The author argues that X causes Y"       ← summarizing
- "Proves that method Z works in 5 steps"   ← summarizing
- "The three principles of success"         ← summarizing

GOOD reasons:
- "Likely contains the author's definition of paradigm shift"
- "Discusses the historical context the question refers to"
- "Covers the chapter-end section distinguishing X from Y"

Return ONLY JSON matching the schema.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'relevance', strict: true, schema: RELEVANCE_SCHEMA },
    },
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const json = JSON.parse(response.choices[0]?.message?.content ?? '{}')
  return (json.matches ?? []).map((m: any) => ({
    chapterId: m.chapter_id, reason: m.reason,
  }))
}

let client: OpenAI | null = null
function openai() { if (!client) client = new OpenAI(); return client }
```

### 6.2 Question Result 页面（`app/b/[bookId]/q/[questionId]/page.tsx`）

Server component 加载 question + question_chapters + 每章的 title/seq，传给 client 的 `<QuestionResultScreen>`。

```tsx
// app/b/[bookId]/q/[questionId]/page.tsx
export default async function QuestionResultPage({
  params,
}: { params: Promise<{ bookId: string; questionId: string }> }) {
  const { bookId, questionId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/b/${bookId}/q/${questionId}`)

  const db = createAdminClient()
  const { data: question } = await db.from('questions')
    .select('id, text, book_id, user_id, books(id, owner_id, title, author, storage_path)')
    .eq('id', questionId).single()
  if (!question || question.user_id !== user.id || question.book_id !== bookId) {
    redirect(`/b/${bookId}`)
  }

  const { data: matches } = await db.from('question_chapters')
    .select('chapter_id, reason, rank, chapters(id, seq, title, page_start, page_end)')
    .eq('question_id', questionId)
    .order('rank')

  return <QuestionResultScreen
    bookId={bookId}
    bookTitle={question.books.title}
    bookAuthor={question.books.author}
    storagePath={question.books.storage_path}
    question={question}
    matches={matches ?? []}
  />
}
```

### 6.3 分屏组件（`components/QuestionResultScreen.tsx`）

```tsx
'use client'
import { useState } from 'react'
import { ChapterListPane } from './ChapterListPane'
import { BriefPane } from './BriefPane'
import { ReadPane } from './ReadPane'

export function QuestionResultScreen({ bookId, ..., matches }: Props) {
  const [activePane, setActivePane] = useState<
    | { mode: 'brief'; chapterId: string; chapterTitle: string; chapterSeq: number }
    | { mode: 'read';  chapterId: string; chapterTitle: string; chapterSeq: number; pageStart: number }
    | null
  >(null)

  return (
    <main className="grid min-h-screen lg:grid-cols-[2fr_3fr] gap-0">
      <ChapterListPane
        bookId={bookId}
        question={question.text}
        matches={matches}
        activeChapterId={activePane?.chapterId ?? null}
        onBrief={(c) => setActivePane({ mode: 'brief', ...c })}
        onRead={(c) => setActivePane({ mode: 'read', ...c })}
      />
      <section className="border-l border-border">
        {!activePane && <EmptyPaneHint />}
        {activePane?.mode === 'brief' && (
          <BriefPane bookId={bookId} chapterId={activePane.chapterId} />
        )}
        {activePane?.mode === 'read' && (
          <ReadPane
            bookId={bookId}
            chapterId={activePane.chapterId}
            chapterTitle={activePane.chapterTitle}
            pageStart={activePane.pageStart}
          />
        )}
      </section>
    </main>
  )
}
```

### 6.4 ChapterListPane

渲染 matches 列表。每项：章节编号 + 标题 + AI reason + [Brief] / [Read] 两按钮。支持 `chapter_id === null` 的 book-level 条目（显示为 "📖 Book-level: read intro + conclusion"，点击跳首章）。

头部："← Back to book"（回 `/b/[bookId]`），还有当前 question 文字。

### 6.5 BriefPane

调 `/api/brief` 拿 4 段式结果（缓存 per chapter_id），按 Rule 3 结构化渲染。见 Phase 8。

### 6.6 ReadPane

PDF viewer 从 `pageStart` 开始渲染。右侧小区块："Highlight & Ask" —— 用户在 PDF 里选中文字 → 触发 `/api/ask`。见 Phase 10。

---

## Phase 7 — 登录 Modal + Session → User 迁移（v2 简化）

**v2 关键改动**：登录时机从 Map → Brief 前移到 Upload → Book Home。其余 claim 机制不变。

### 7.1 共享 helper（`lib/auth/claim.ts`）

```typescript
export async function claimSessionBooks({
  userId, sessionId,
}: { userId: string; sessionId: string }): Promise<{ claimed: number }> {
  const db = createAdminClient()
  const { data: claimed } = await db.from('books')
    .update({ owner_id: userId, session_id: null })
    .eq('session_id', sessionId)
    .is('owner_id', null)
    .select('id, storage_path')

  for (const book of claimed ?? []) {
    const newPath = book.storage_path.replace(/^session\/[^/]+\//, `user/${userId}/`)
    if (newPath === book.storage_path) continue
    const { error } = await db.storage.from('vr-docs').move(book.storage_path, newPath)
    if (error) { console.error('storage move failed', error); continue }
    await db.from('books').update({ storage_path: newPath }).eq('id', book.id)
  }
  return { claimed: claimed?.length ?? 0 }
}
```

### 7.2 `/api/claim` 薄壳（兜底 Email 登录路径）

```typescript
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionId = await getSessionId()
  if (!sessionId) return NextResponse.json({ claimed: 0 })
  return NextResponse.json(await claimSessionBooks({ userId: user.id, sessionId }))
}
```

### 7.3 Callback 内联 claim

```typescript
// app/auth/callback/route.ts
const { data } = await supabase.auth.exchangeCodeForSession(code)
const sessionId = await getSessionId()
if (sessionId) {
  try { await claimSessionBooks({ userId: data.user.id, sessionId }) } catch {}
}
return NextResponse.redirect(`${origin}${next}`)
```

### 7.4 v2 时序

```
Landing (未登录) → drop PDF
  ↓ /api/upload (session_id 绑定)
  ↓ 返回 bookId
Landing → 自动 fetch /b/${bookId} → middleware 拦截 → redirect /auth/login?next=/b/${bookId}
  ↓ LoginModal 弹 (或 /auth/login 页面)
  ↓ Google OAuth 或 Email/Password
/auth/callback?next=/b/${bookId}
  ↓ exchangeCodeForSession
  ↓ 内联 claimSessionBooks
  ↓ redirect /b/${bookId}
Book Home 渲染 ← 用户首次看到 TOC + overview + 3 suggestions + 空历史
```

---

## Phase 8 — Brief 模式（Rule 3，挂在 QuestionResult 右栏）

### 8.1 AI Briefer（`lib/ai/briefer.ts`）

```typescript
const BRIEF_SCHEMA = {
  type: 'object',
  required: ['one_sentence', 'key_claims', 'example', 'not_addressed'],
  additionalProperties: false,
  properties: {
    one_sentence: { type: 'string', maxLength: 240 },
    key_claims: {
      type: 'array', minItems: 3, maxItems: 3,
      items: { type: 'string', maxLength: 200 },
    },
    example: { type: 'string', maxLength: 500 },
    not_addressed: { type: 'string', maxLength: 360 },
  },
} as const

export async function briefChapter(chapterTitle: string, content: string) {
  // v2: Brief 不再绑 goal / question。Brief 是章节级客观结构化笔记。
  const prompt = `Produce a structured reading note for a book chapter.

CHAPTER: ${chapterTitle}

CHAPTER CONTENT:
${content.slice(0, 12000)}

Output a 4-part brief. STRICT STRUCTURE — NO PROSE:

1. one_sentence: The one-sentence version of this chapter's core claim.
2. key_claims: EXACTLY 3 claims the author makes. Each < 200 chars.
3. example: One concrete example the author uses. < 500 chars.
4. not_addressed: What the author does NOT address, that the reader might expect. < 360 chars.

Do not write introductions, summaries, or conclusions.
Return JSON only.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'brief', strict: true, schema: BRIEF_SCHEMA },
    },
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  })

  return JSON.parse(response.choices[0]?.message?.content ?? '{}')
}
```

### 8.2 Brief API（`app/api/brief/route.ts`）

- 验 auth → 验 chapter 属于 user 的书
- 查缓存 `vr.briefs.where(chapter_id)`，命中直接返回
- 否则跑 `briefChapter`，写缓存，返回

### 8.3 BriefPane 组件

按 4 段式渲染。**v2 改动**：底部不再有 "Restate →" 按钮。ResultPane 里只做展示 —— 用户看完可以在左栏切下一章 Brief/Read，或 ← 回 Book Home 问下一个问题。

```tsx
<div className="p-6">
  <h2>Chapter {seq}: {title}</h2>

  <Section label="The one sentence version:">
    <p>{brief.one_sentence}</p>
  </Section>

  <Section label="The 3 key claims:">
    <ol>
      {brief.key_claims.map((c, i) => <li key={i}>{c}</li>)}
    </ol>
  </Section>

  <Section label="One example the author uses:">
    <p>{brief.example}</p>
  </Section>

  <Section label="What the author does NOT address:">
    <p>{brief.not_addressed}</p>
  </Section>
</div>
```

---

## Phase 9 — ⚠️ Reserved for v1.1: Restate + Check

> **THIS PHASE IS DEFERRED.** 代码 / 表 / API 全部保留，UI 入口在 v1 不可见。v1.1 重做时作为「AI-assisted active reading」feature。

保留的构件：
- `vr.restatements` 表（schema 不动）
- `lib/ai/checker.ts`（"another reader in the room" 版本的 prompt 保留）
- `app/api/check/route.ts`（端点可调用）
- `components/RestateScreen.tsx`（文件保留，不挂路由）

删除的构件（v2 没有了）：
- `app/b/[bookId]/restate/[chapterId]/page.tsx`（route 删除）
- Brief 底部的 "Restate →" 按钮
- MapScreen / BookHome 里所有指向 restate 的链接

**v1.1 设计预留**：当 restate 回归时，大概率不是强制 gate，而是 BriefPane 底部一个可选 "Restate this" 按钮，进入 restate-in-pane 体验。不是强制跳转。

---

## Phase 10 — Read 模式（挂在 QuestionResult 右栏）

### 10.1 PdfViewer 组件

```tsx
'use client'
import { Document, Page, pdfjs } from 'react-pdf'
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'   // self-hosted in public/

export function PdfViewer({ url, initialPage }: { url: string; initialPage: number }) {
  const [numPages, setNumPages] = useState<number>(0)
  return (
    <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
      {/* 渲染 initialPage 及之后若干页，用户可滚动 */}
    </Document>
  )
}
```

**v2 变化**：Read 不再是独立 page。`<ReadPane>` 拿 chapter 的 page_start，让 PdfViewer 从那一页开始。用户可滚动到相邻章节 —— 不强制限制页码区间。

### 10.2 Ask API（`app/api/ask/route.ts`）

用户在 Read pane 选中文字 → 右侧 "Highlight & Ask" 按钮激活 → 发 /api/ask。

```typescript
export async function POST(request: Request) {
  const { bookId, chapterId, selection } = await request.json()
  // 验 auth + book/chapter 所属
  // prompt: 解释这段话（只解释选中内容，不总结整章）
  // 返回短答案
}
```

### 10.3 ReadPane 组件

左栏选中、右栏 sidebar 显示历史问答（同现在 v1 的实现）。v2 没变。

---

## Phase 11 — /library 页面

登录后用户看书列表。**v2 改动**：链接指向 `/b/[id]`（Book Home），不是老的 `/b/[id]/map`。

```tsx
export default async function LibraryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const db = createAdminClient()
  const { data: books } = await db.from('books')
    .select(`
      id, title, author, page_count, created_at,
      questions(id, created_at)
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1>Your Library</h1>
      {books?.map((b) => (
        <Link key={b.id} href={`/b/${b.id}`}>
          <div>
            <h3>{b.title}</h3>
            <p>{b.author}</p>
            <p>{b.questions?.length ?? 0} questions asked · last {lastActive(b.questions)}</p>
          </div>
        </Link>
      ))}
    </main>
  )
}
```

不做：搜索、标签、筛选、统计、分享。

---

## Phase 12 — Session PDF 24h 清理 Cron

**v2 不变**：session book 机制仍在（upload 之前 / claim 之前的 book）。

### 12.1 `vercel.json`

```json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 1 * * *" }]
}
```

### 12.2 Cleanup Route

```typescript
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: orphans } = await db.from('books')
    .select('id, storage_path')
    .is('owner_id', null)
    .lt('created_at', cutoff)

  if (orphans && orphans.length > 0) {
    await db.storage.from('vr-docs').remove(orphans.map((b) => b.storage_path))
    await db.from('books').delete().in('id', orphans.map((b) => b.id))
  }
  return Response.json({ deleted: orphans?.length ?? 0 })
}
```

---

## Phase 13 — Vercel 部署

**v2 不变**。首次部署在 Phase 1 landing 可见就触发，之后每 push 自动 redeploy。

### 13.1 首次部署

```
[Human] Vercel Dashboard → New Project → Import Git Repository → vibe-reading
[Human] Framework: Next.js → Deploy
[Human] Settings → Environment Variables → "Paste .env" 粘凭据（GITHUB_TOKEN 除外）
[Human] NEXT_PUBLIC_APP_URL = 生产 URL
[Human] Deployments → 最新 → Redeploy（让 env 生效）
[Human] 打开线上 URL 实测 landing
```

### 13.2 Build Command

默认 `next build`。不改。

### 13.3 OAuth Redirect URL（上线后）

```
[Human] Supabase Dashboard → Auth → URL Configuration → Redirect URLs
        加 `https://<your-domain>/auth/callback`
```

Google Cloud Console **不用动** —— redirect URI 配的是 Supabase 侧。

### 13.4 后续每次 push 即部署

`git push main` → 自动构建 + 部署。Env vars 改了要手动 Redeploy。

---

## 常见坑（继承 STANDARD + Vibe Reading 专属）

| 坑 | 原因 | 解法 |
|----|------|------|
| Supabase Storage 公开 | 默认 public | 建 bucket 选 private，用 signed URL |
| PDF 解析 OOM | 大 PDF 全加载 | 限制 50MB，流式解析 |
| PDF 没 outline | 老书 / 扫描版 | `extractOutline` 返回 null → 走 splitIntoChaptersRegex fallback |
| 章节切分 fallback 全炸 | 没 "Chapter N" 标题 | size-based fallback (~10k 字/段，最多 50 段) |
| Relevance AI 超时 | 把全章内容塞 prompt | 只传 TOC + 每章 600 字 first paragraph |
| Rule 1 被绕过 | 用户直接访问 `/b/xxx/q/yyy` 跳过 question 输入 | 页面第一步验 question 属于这本书的 user；否则 redirect `/b/xxx` |
| Rule 2 AI 输出摘要 | prompt 不够狠 | 反复迭代 prompt，加 BAD / GOOD 例子对照 |
| Rule 3 Brief 散文 | 没用 JSON schema | OpenAI `response_format: json_schema` + strict |
| Intake AI 卡住整个 upload | 同步跑 | 可接受（总时长 ~10-15s）；若需异步：后续版本切 background job |
| Meta 问题无章节匹配 | Relevance 强行套章节 | prompt 允许返回 `chapter_id: null`（book-level） |
| 登录后丢失 book 上下文 | callback 直接跳 `/library` | callback 必须读 `?next=` 参数 |
| PDF worker 报错 | `workerSrc` 没设 | self-host pdf.worker.min.mjs 在 public/ |
| Session book 孤儿 | 24h cron 没跑 | 每周查 Vercel Cron 日志 |

---

## 环境变量完整清单

```bash
# Supabase (Phase 0)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI (Phase 4, 6, 8, 10)
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=

# Cron (Phase 12)
CRON_SECRET=
```

---

## 新项目 Checklist

```
□ npx create-next-app vibe-reading --typescript --tailwind --app
□ npx shadcn@latest init
□ npm install @supabase/supabase-js @supabase/ssr unpdf react-pdf openai
□ 复用 launchradar Supabase project：从 launchradar/.env.local 复制凭据
□ Phase 1: Landing + UploadDropzone + SessionId cookie + STANDARD §2.5 清理
□ ✨ 首次 Vercel 部署（Paste .env + 实测 landing）
□ Supabase Redirect URLs 加生产 URL
□ Dashboard → Data API → Exposed schemas 加 `vr` → Save
□ Storage bucket `vr-docs`：Phase 4 创建时用
□ Phase 2: SQL 在 vr schema 建表 + RLS + policies
□ npm run db:types 生成类型
□ Phase 3: Auth（middleware 保护整个 /b/*）
□ Phase 4: Upload API + lib/pdf/outline.ts + lib/pdf/parser.ts + lib/ai/intake.ts
□ Phase 5: Book Home（/b/[id] page + BookHomeScreen + /api/question）
□ Phase 6: Question Result + QuestionResultScreen + ChapterListPane + lib/ai/relevance.ts
□ Phase 7: LoginModal + /api/claim + callback 内联 claim
□ Phase 8: BriefPane + /api/brief + lib/ai/briefer.ts
□ Phase 10: ReadPane + PdfViewer + /api/ask + lib/ai/asker.ts
□ 端到端实测：Upload → Login → Book Home → Ask → Result → Brief / Read
□ Phase 11: /library
□ Phase 12: cron cleanup + vercel.json
□ new-project.sh 已处理：sprint-report.yml + notify-playbook.yml
□ GitHub Secrets 加 PLAYBOOK_TOKEN
```

> **Phase 9 (Restate) 跳过** —— Reserved for v1.1。代码 / 表保留，UI 不挂。

---

## 成功判定

参照 `docs/vibe-reading.md` §Success Criteria：

**Week 1**：作者自测 —— 用 MVP 读完 1 本自己真想读的书。比 ChatPDF / NotebookLM 差 → 回炉。

**Week 2-4**：5-10 个朋友试用 —— 看他们在 Book Home 输入框写得出问题吗？用的是自己的问题还是 AI 推荐的？大部分人卡住 → 方法论太理想化，重新设计。

---

## Human Work Budget (v2)

按 STANDARD §11 的 5-Phase 顺序。

| STD Phase | 🙋 Step | Time | 备注 |
|---|---|---|---|
| 0 | GitHub repo → Secrets 加 `PLAYBOOK_TOKEN` | 30s | |
| 0→1 | 从 launchradar 拷 Supabase / OpenAI / CRON_SECRET 到 .env.local | 1 min | |
| 1 | Phase 1 全 🤖 | — | |
| **2** | Vercel Dashboard → Import repo → Paste .env → Deploy | 3 min | landing 可见就部 |
| 2 | 线上 URL 实测 landing 渲染 | 1 min | |
| 3 | Supabase SQL Editor 跑 vr schema SQL | 2 min | 🤖 产出 SQL |
| 3 | Data API → Exposed schemas 加 `vr` → Save | 1 min | |
| 3 | `npx supabase login` | 2 min | |
| 3 | Google Cloud Console → OAuth Client + redirect URI | 3 min | |
| 3 | Supabase Auth → Google toggle ON + 粘 Client ID/Secret | 2 min | |
| 3 | 浏览器测 Email / Google / middleware redirect | 5 min | |
| 4 | — | 0 | 无付费 |
| 5-N | 每 Phase push → Vercel 自动 redeploy → 浏览器走 user flow | ~3 min × phase | v2 业务 phase 约 7 个 |
| 上线后 | Google OAuth + Supabase Redirect URL 加生产 URL | 3 min | 首次 prod deploy 后 |

### Total 估算 (v2)

- **Setup (Phase 0-3)**：~20 min
- **Per business phase**：~3 min
- **全 MVP (7 业务 phase)**：~20 min setup + ~21 min phase testing = **~40 min 总人工时间**
- **上线后一次性**：+3 min

### 全新基础设施额外成本

新 Supabase project + 新 GCP OAuth：**+20 min**

### 每次 schema 改动

~2 min（SQL 粘 Editor + `npm run db:types`）

### v1 → v2 迁移（已做过一次，记录留档）

- drop `vr.goals` + `vr.chapter_maps`
- drop `vr.briefs` 重建（unique 改 chapter_id）
- 给 `vr.books` 加 toc / overview / suggested_questions
- 给 `vr.chapters` 加 level
- 建 `vr.questions` + `vr.question_chapters`
- 4 本测试书：让用户重新上传（最简单）
- 删老 page：`/goal`、`/map`、`/brief/[cid]`、`/read/[cid]`、`/restate/[cid]`
- 删老 API：`/api/goal`、`/api/map`
- 删老 lib：`lib/ai/mapper.ts`

---

## Sprint Summary

_This section will be auto-updated by the sync-from-projects workflow once the repo is created._
