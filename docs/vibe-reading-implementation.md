# Vibe Reading — Implementation Guide

**Product**: Vibe Reading
**Tagline**: A reading tool that refuses to summarize the book before you tell it why you're reading it.
**Stack**: Next.js 14 App Router + TypeScript + Tailwind + Shadcn/ui + Supabase (Supabase-only, no Prisma) + OpenAI + Vercel
**Repo**: `github.com/dongzhang84/vibe-reading` (to be created, open source)
**Last Updated**: April 2026

> 单一 source of truth。按 Phase 顺序执行，不跳步。标准模块部分严格遵循 `stack/STANDARD.md`，业务逻辑部分在每个 Phase 内定制。
> **No Stripe**：这是开源项目，MVP 全免费，不写付费相关代码。未来托管商业版再另算。
> **No Prisma**：采用 STANDARD.md §4.6 的 Supabase-only 方案。所有数据库操作用 `supabase-js` 客户端，schema 在 Supabase Dashboard 管理。

---

## ⚠️ Golden Rules

四条哲学铁律。写代码过程中不能妥协，review 时也要反复对照。

**Rule 1** — AI 不能在用户表达需求之前输出任何关于书的内容。
- Upload (Screen 1) 后不能立刻返回任何 AI 摘要
- 路由层强制 Screen 1 → Screen 2（goal 输入）为硬卡点
- `/api/map`、`/api/brief` 等所有内容 API 的第一步都要检查 goal 是否存在

**Rule 2** — Screen 3（三色映射）只做映射，不做内容。
- Prompt 里明确禁止总结章节内容
- 输出只能说"Chapter 3 *likely contains* the core definition"，不能说"Chapter 3 *argues that...*"
- 章节的实际内容必须等用户点击 Read/Brief 才触发

**Rule 3** — Brief 模式（Screen 4B）输出严格 4 段式结构。
- 1-sentence version + 3 key claims + 1 example + what author doesn't address
- AI 调用用 JSON schema 约束，不允许散文
- 前端按 4 段式渲染，超出 schema 的字段丢弃

**Rule 4** — Brief 模式必须强制接 Screen 5（restate + check）。
- Screen 4B 底部**只有一个**按钮：`Now I'll restate this in my own words →`
- 不提供"返回 library"、"读下一章"、"跳过复述"等逃生门
- 用户必须在 Screen 5 提交复述后，才能回到 Screen 3 选下一章

---

## Phase 0 — 项目初始化

### Step 1: Scaffold

```bash
npx create-next-app@latest vibe-reading --typescript --tailwind --app
cd vibe-reading
npx shadcn@latest init
npm install @supabase/supabase-js @supabase/ssr pdf-parse react-pdf openai
npm install -D @types/pdf-parse supabase
```

### Step 2: Supabase 配置

**按 STANDARD §3.7 Supabase Setup Checklist 执行**，以下是 Vibe Reading 的偏离：

- **复用 launchradar 的 Supabase project** — 不新建 project。凭据从 `/Users/dong/Projects/launchradar/.env.local` 直接复制
- **Schema**：`vr`（2-letter 前缀约定；LaunchRadar 在 `public`，GrowPilot 未来 `gp`）
- **Auth 设置**：launchradar 已配好 Email + Google，无需再动
- **Storage bucket**：暂缓到 Phase 4（PDF 上传）时再决定用 `vr-pdfs` 还是别的名字
- **跳过**的 provider：GitHub OAuth / Magic Link / 其他——只保留 Email + Google

### Step 3: 目录结构

```
vibe-reading/
├── app/
│   ├── api/
│   │   ├── upload/route.ts         ← PDF 解析入口
│   │   ├── goal/route.ts           ← 存 user goal
│   │   ├── map/route.ts            ← 三色映射 (AI)
│   │   ├── brief/route.ts          ← Brief 模式 (AI)
│   │   ├── check/route.ts          ← Restate 挑错 (AI)
│   │   ├── ask/route.ts            ← Read 模式 highlight & ask (AI)
│   │   ├── claim/route.ts          ← session book → user book 迁移
│   │   └── cron/cleanup/route.ts   ← 24h session PDF 清理
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── callback/route.ts
│   ├── b/[bookId]/
│   │   ├── goal/page.tsx           ← Screen 2
│   │   ├── map/page.tsx            ← Screen 3
│   │   ├── read/[chapterId]/page.tsx   ← Screen 4A
│   │   ├── brief/[chapterId]/page.tsx  ← Screen 4B
│   │   └── restate/[chapterId]/page.tsx ← Screen 5
│   ├── library/page.tsx
│   ├── page.tsx                    ← Screen 1 (Landing + Upload)
│   └── layout.tsx
├── components/
│   ├── LoginModal.tsx
│   ├── UploadDropzone.tsx
│   ├── PdfViewer.tsx               ← react-pdf 封装
│   └── ui/...
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── pdf/parser.ts
│   ├── ai/
│   │   ├── mapper.ts
│   │   ├── briefer.ts
│   │   ├── checker.ts
│   │   └── asker.ts
│   └── session.ts                  ← pre-login session cookie 工具
├── types/
│   ├── index.ts
│   └── db.ts                       ← supabase gen types 输出
├── middleware.ts
├── vercel.json
└── .env.local
```

### Step 4: 环境变量

`.env.local`（Supabase 凭据直接从 `launchradar/.env.local` 复制——共享同一个 project）：

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
CRON_SECRET=            # 可复用 launchradar 的，或 openssl rand -base64 32
```

> 没有 `DATABASE_URL`（Supabase-only 模式）。
> 没有 Stripe 变量。

### Step 5: Supabase TypeScript 类型自动生成

**关键：必须加 `--schema vr`，否则默认只生成 `public`。**

```bash
npx supabase login
npx supabase gen types typescript --project-id myvtqxfcwzrntepcfvkn --schema vr > types/db.ts
```

把这行加到 `package.json`:

```json
"scripts": {
  "db:types": "supabase gen types typescript --project-id myvtqxfcwzrntepcfvkn --schema vr > types/db.ts"
}
```

每次改 schema 后跑 `npm run db:types` 刷新类型。

---

## Phase 1 — Landing + Upload (Screen 1) + 壳

产品的第一印象屏。要做到打开页面 5 秒内理解：**这个工具不一样，它拒绝偷懒**。

本 Phase **不是只写文案**，要把整个 app 的壳定下来。不能把 landing 设计留给"后面再搞"——Next.js scaffold 的默认 title / favicon / 字体留着就是泄露，视觉第一印象立刻掉价。

### 1.0 壳基础

**按 STANDARD §2.5 Scaffold 清理执行。** 本项目的定制：
- Monogram 用 **V 字形**（`path d="M9.5 9.5 L16 22.5 L22.5 9.5"`）
- metadata 的 title / description 用本文档顶部的 Product / Tagline

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

- 全英文 UI，不加中文切换
- **不**放 "Sign in" 按钮在顶部 nav（避免用户焦虑"登录是否解锁什么"）
- 极简风格，除了 ✅❌⚠️ 三个功能性 emoji，其他不加装饰

### 1.2 Upload Dropzone（`components/UploadDropzone.tsx`）

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function UploadDropzone() {
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      alert('Max 50MB')
      return
    }
    if (file.type !== 'application/pdf') {
      alert('PDF only')
      return
    }

    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const { bookId } = await res.json()
    window.location.href = `/b/${bookId}/goal`   // Rule 1 硬卡点
  }

  return (
    <div onDrop={(e) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    }}>
      {/* drop UI + file input fallback */}
    </div>
  )
}
```

### 1.3 Session Cookie 工具（`lib/session.ts`）

登录前的用户靠 session cookie 识别。

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
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,   // 24h
    path: '/',
  })
  return sid
}

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}
```

---

## Phase 2 — 数据库 Schema

**在 Supabase Dashboard → SQL Editor 直接跑下面的 SQL。** 不用 migration 工具，改 schema 就直接改。

**约定：**（遵循 `stack/STANDARD.md` §4.1）
- 所有表放在 `vr` schema（不是 `public`）
- 所有表 **RLS ENABLED** + owner-based policies（Layer 2 防御）
- API route 第一行仍必须验证 session（Layer 1 防御 — STANDARD §4.1）
- 后端 admin client（`service_role` key）自动绕过 RLS
- pre-login session book 场景：`owner_id` 为 null 的行 RLS 不允许前端看到——这没问题，pre-login 流程只通过后端 API（service_role）访问

> 需要推倒重建时：先把下面第一段 `drop schema if exists vr cascade;` 跑一次再跑完整脚本。

```sql
-- 如需重置：取消下面两行注释
-- drop schema if exists vr cascade;
-- create schema vr;

create schema if not exists vr;

-- Grants
grant usage on schema vr to service_role, authenticated;
alter default privileges in schema vr grant all on tables to service_role;
alter default privileges in schema vr grant all on sequences to service_role;
alter default privileges in schema vr grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema vr grant usage, select on sequences to authenticated;

-- ─── books ───────────────────────────────────────────────────────────────────
-- pre-login: owner_id=null + session_id；login 后: owner_id=user.id + session_id=null
create table vr.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  session_id text,
  title text not null,
  author text,
  storage_path text not null,
  page_count int,
  created_at timestamptz default now()
);
create index on vr.books (owner_id);
create index on vr.books (session_id);
alter table vr.books enable row level security;
create policy "own books read"   on vr.books for select using (auth.uid() = owner_id);
create policy "own books insert" on vr.books for insert with check (auth.uid() = owner_id);
create policy "own books update" on vr.books for update using (auth.uid() = owner_id);
create policy "own books delete" on vr.books for delete using (auth.uid() = owner_id);

-- ─── chapters ────────────────────────────────────────────────────────────────
create table vr.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  seq int not null,
  title text not null,
  content text not null,
  page_start int,
  page_end int
);
create index on vr.chapters (book_id, seq);
alter table vr.chapters enable row level security;
create policy "own chapters" on vr.chapters for all
  using (book_id in (select id from vr.books where owner_id = auth.uid()))
  with check (book_id in (select id from vr.books where owner_id = auth.uid()));

-- ─── goals ───────────────────────────────────────────────────────────────────
-- 一本书一个 goal；改 goal 会覆盖
create table vr.goals (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  text text not null,
  created_at timestamptz default now(),
  unique (book_id)
);
alter table vr.goals enable row level security;
create policy "own goals" on vr.goals for all
  using (book_id in (select id from vr.books where owner_id = auth.uid()))
  with check (book_id in (select id from vr.books where owner_id = auth.uid()));

-- ─── chapter_maps (三色映射缓存) ─────────────────────────────────────────────
create table vr.chapter_maps (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references vr.books(id) on delete cascade,
  goal_id uuid not null references vr.goals(id) on delete cascade,
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  verdict text not null check (verdict in ('worth', 'skip', 'unanswered')),
  reason text not null,
  created_at timestamptz default now(),
  unique (goal_id, chapter_id)
);
alter table vr.chapter_maps enable row level security;
create policy "own chapter_maps" on vr.chapter_maps for all
  using (book_id in (select id from vr.books where owner_id = auth.uid()))
  with check (book_id in (select id from vr.books where owner_id = auth.uid()));

-- ─── briefs (4 段式 Brief 缓存) ──────────────────────────────────────────────
create table vr.briefs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  goal_id uuid not null references vr.goals(id) on delete cascade,
  one_sentence text not null,
  key_claims jsonb not null,         -- string[] of length 3
  example text not null,
  not_addressed text not null,
  created_at timestamptz default now(),
  unique (chapter_id, goal_id)
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

-- ─── restatements (用户复述 + AI 挑错结果) ──────────────────────────────────
create table vr.restatements (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references vr.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  got_right jsonb not null,          -- string[]
  missed jsonb not null,             -- string[]
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

跑完 SQL 后：
1. 按 STANDARD §3.7.3 把 `vr` 加到 Exposed Schemas
2. 按 STANDARD §3.7.5 用探针脚本验证（service_role ✅ / anon blocked）
3. 生成类型：

```bash
npm run db:types
```

---

## Phase 3 — Auth（Email/Password + Google）

照 STANDARD.md §3 原样复制 `lib/supabase/client.ts` / `server.ts` / `admin.ts` / `callback/route.ts` / `middleware.ts`。**只有以下偏离：**

### 3.0 所有 createClient 必须指定 schema + Database 泛型

我们的表在 `vr` schema，不是 `public`。每个 `createClient` 都要传 schema 选项（否则 `.from('books')` 会去查不存在的 `public.books`），并且带上 `<Database, 'vr'>` 泛型把 TypeScript 类型也聚焦到 vr schema：

```typescript
import type { Database } from '@/types/db'

createBrowserClient<Database, 'vr'>(url, key, { db: { schema: 'vr' } })
createServerClient<Database, 'vr'>(url, key, { cookies: {...}, db: { schema: 'vr' } })
createClient<Database, 'vr'>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'vr' },
})
```

配完之后，`.from('books')` 自动解析成 `vr.books`，字段名和类型也有完整编译期检查。**不要**写 `.from('vr.books')`。

### 3.1 砍掉 GitHub

STANDARD §3.2 的 login 页里有 GitHub OAuth，**不要**。只保留 Email/Password 和 Google。

### 3.2 Middleware 路由保护

`middleware.ts`：

```typescript
const PROTECTED_ROUTES = ['/library']
const CHAPTER_ROUTES = /^\/b\/[^/]+\/(read|brief|restate)/   // Screen 4/5 必须登录

// Screen 1-3 (/ 和 /b/xxx/goal 和 /b/xxx/map) 不要求登录
```

**注意**：`/b/[bookId]/goal` 和 `/b/[bookId]/map` **不** protected。用户在登录前也能走到这两屏——这是产品设计的核心（spec §Login Strategy）。

### 3.3 Register 后不创建 Profile 表

Vibe Reading 的 schema 里**没有 Profile 表**——用户信息直接用 `auth.users` 里的即可。STANDARD §3.3 的 upsert Profile 代码不要复制。

### 3.4 Login Modal（不是 full page）

Screen 3 → Screen 4 之间的登录**是 modal 不是跳转**。组件在 `components/LoginModal.tsx`，提供 Google + Email/Password 两种方式，按 Esc 或点遮罩关闭。点 Google 走 `/auth/callback?next=<returnTo>` 回跳；Email 登录成功调 `onSuccess` 回调（不跳页）。

### 3.5 Callback 支持 next 参数

`app/auth/callback/route.ts` 读 `?next=<path>` 并在 `exchangeCodeForSession` 成功后跳转。**防开放重定向：** 只接受以 `/` 开头且不以 `//` 开头的同源路径；其他一律降级到 `/library`。登录后要回到用户登录前所在的那一屏，不能粗暴跳到 `/library`——否则 Screen 3 的上下文就丢了。

### 3.6 登录后 Session → User 迁移

用户登录成功回到 Screen 3 时，前端调用 `/api/claim` 把 session books 认领到当前 user。详见 Phase 7。

---

## Phase 4 — PDF 解析 + 章节切分

### 4.1 Upload API（`app/api/upload/route.ts`）

```typescript
import { NextResponse } from 'next/server'
import { getOrCreateSessionId } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePdf, splitIntoChapters } from '@/lib/pdf/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const sessionId = await getOrCreateSessionId()

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max 50MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { title, author, text, pageCount } = await parsePdf(buffer)
  const chapters = splitIntoChapters(text)

  if (chapters.length === 0) {
    return NextResponse.json({ error: 'Could not detect chapters' }, { status: 422 })
  }

  const db = createAdminClient()

  // 上传 PDF 到 Storage（路径用 sessionId 隔离）
  const storagePath = `session/${sessionId}/${crypto.randomUUID()}.pdf`
  await db.storage.from('pdfs').upload(storagePath, buffer, {
    contentType: 'application/pdf',
  })

  // 写 books
  const { data: book, error } = await db
    .from('books')
    .insert({
      session_id: sessionId,
      title,
      author,
      storage_path: storagePath,
      page_count: pageCount,
    })
    .select()
    .single()
  if (error) throw error

  // 写 chapters
  await db.from('chapters').insert(
    chapters.map((c, i) => ({
      book_id: book.id,
      seq: i,
      title: c.title,
      content: c.content,
      page_start: c.pageStart,
      page_end: c.pageEnd,
    })),
  )

  return NextResponse.json({ bookId: book.id })
}
```

### 4.2 PDF Parser（`lib/pdf/parser.ts`）

```typescript
import 'server-only'
import { PDFParse } from 'pdf-parse'

export async function parsePdf(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const [info, text] = await Promise.all([parser.getInfo(), parser.getText()])
    return {
      title: info.info?.Title ?? 'Untitled',
      author: info.info?.Author,
      text: text.text,
      pageCount: text.pages.length,
    }
  } finally {
    await parser.destroy()
  }
}

export interface ChapterChunk {
  title: string
  content: string
  pageStart?: number
  pageEnd?: number
}

export function splitIntoChapters(fullText: string): ChapterChunk[] {
  // 尝试按 "Chapter N" / "CHAPTER N" / 中文"第 N 章" 切分
  const pattern = /\n\s*(?:Chapter\s+\d+|CHAPTER\s+\d+|第[一二三四五六七八九十百零〇\d]+章)[^\n]{0,80}\n/gi

  const matches: { index: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(fullText)) !== null) {
    matches.push({ index: m.index, title: m[0].trim() })
  }

  if (matches.length === 0) {
    // Fallback: 按数字编号段落
    return fallbackSplit(fullText)
  }

  const chunks: ChapterChunk[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length
    const raw = fullText.slice(start, end).trim()
    const [titleLine, ...rest] = raw.split('\n')
    chunks.push({
      title: titleLine.trim(),
      content: rest.join('\n').trim(),
    })
  }
  return chunks.filter((c) => c.content.length > 200)
}

function fallbackSplit(text: string): ChapterChunk[] {
  // 按 form-feed 或 20+ 换行切大段
  return text
    .split(/\n{5,}/)
    .map((s, i) => ({ title: `Section ${i + 1}`, content: s.trim() }))
    .filter((c) => c.content.length > 500)
}
```

> **章节切分是精度痛点**。先用规则粗切，自测发现不对再迭代。**不要一开始就用 AI 切分**，太贵太慢。

### 4.3 Admin Client（`lib/supabase/admin.ts`）

照 STANDARD §3.1 原样。用 `service role key`，绕过任何未来可能加的 RLS。

---

## Phase 5 — Screen 2: Goal 输入（Rule 1 的硬卡点）

### 5.1 页面（`app/b/[bookId]/goal/page.tsx`）

```tsx
'use client'
import { useState } from 'react'

export default function GoalPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  const [text, setText] = useState('')
  const [showExamples, setShowExamples] = useState(false)

  async function submit() {
    if (text.trim().length < 10) return
    await fetch('/api/goal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId, text: text.trim() }),
    })
    window.location.href = `/b/${bookId}/map`
  }

  return (
    <main>
      <h1>《{title}》 by {author}</h1>

      <h2>Before we touch this book, tell us:<br />
          <em>What do you want to take away from it?</em></h2>

      <p>Write 1–3 sentences. Don't overthink.<br />
         But you have to type something. This is the one thing that
         makes Vibe Reading different from every other reading tool.</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="..."
      />

      <button onClick={() => setShowExamples(!showExamples)}>
        Not sure what to write? See examples ↓
      </button>
      {showExamples && (
        <ul>
          <li>"I want to understand how the author defines [X]"</li>
          <li>"I'm working on [Y] project — I want to see if there's a relevant method"</li>
          <li>"I keep hearing this book quoted — I want to know if I should actually read it"</li>
          <li>"I want to compare this author's view on [Z] with what I already believe"</li>
          <li>"I have to discuss this book in a meeting next week — I need the gist"</li>
        </ul>
      )}

      <button disabled={text.trim().length < 10} onClick={submit}>
        Continue →
      </button>
    </main>
  )
}
```

### 5.2 Goal API（`app/api/goal/route.ts`）

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionId } from '@/lib/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { bookId, text } = await request.json()
  if (typeof text !== 'string' || text.trim().length < 10) {
    return NextResponse.json({ error: 'Too short' }, { status: 400 })
  }

  // 必须证明用户拥有这本书（session 或 登录 user）
  const db = createAdminClient()
  const { data: book } = await db.from('books').select('id, session_id, owner_id').eq('id', bookId).single()
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const sessionId = await getSessionId()

  const authorized =
    (user && book.owner_id === user.id) ||
    (sessionId && book.session_id === sessionId)
  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // upsert goal（一本书一个 goal）
  await db.from('goals').upsert({ book_id: bookId, text }, { onConflict: 'book_id' })
  return NextResponse.json({ ok: true })
}
```

### 5.3 Rule 1 的技术强制

- `/b/[bookId]/map` 页面第一步：查询 `goals.where(book_id)`。如果没有 goal → 重定向回 `/b/[bookId]/goal`
- `/api/map`、`/api/brief`、`/api/check`、`/api/ask` 所有 AI 端点的第一步：确认 `goals.book_id` 存在。否则 403。

---

## Phase 6 — Screen 3: 三色映射（Rule 2 的核心）

### 6.1 AI Mapper（`lib/ai/mapper.ts`）

```typescript
import 'server-only'
import OpenAI from 'openai'

let client: OpenAI | null = null
function openai() {
  if (!client) client = new OpenAI()
  return client
}

export interface ChapterInput {
  id: string
  seq: number
  title: string
  firstParagraph: string   // 只给前 500 字，不给全章
}

export interface MapResult {
  chapterId: string
  verdict: 'worth' | 'skip' | 'unanswered'
  reason: string           // 1 sentence max
}

export async function mapChapters(
  goal: string,
  chapters: ChapterInput[],
): Promise<MapResult[]> {
  const prompt = `You are a librarian. A reader has a goal and a book's table of contents.
Your job is to MAP chapters to the goal — NOT to summarize content.

READER'S GOAL:
"${goal}"

CHAPTERS (title + first paragraph):
${chapters.map((c) => `[${c.id}] Chapter ${c.seq}: ${c.title}\n${c.firstParagraph}`).join('\n\n')}

For each chapter, return ONE of:
- "worth": this chapter likely contains what the reader wants
- "skip": this chapter is unrelated to the reader's goal
- "unanswered": the reader's goal asks about something this book doesn't address (use sparingly, at most 1 chapter)

For the reason field:
- DO: describe what the chapter "likely contains" or "discusses"
- DO NOT: summarize what the author argues, concludes, or proves
- DO NOT: state facts from the chapter

Examples of GOOD reasons:
- "Likely contains the core definition the reader is looking for"
- "Discusses application scenarios of [goal topic]"
- "Counter-arguments and limitations section"

Examples of BAD reasons (DO NOT DO THIS):
- "The author argues that X is caused by Y" ← SUMMARIZING
- "Shows how to implement method Z in 5 steps" ← SUMMARIZING
- "Explains the three pillars of success" ← SUMMARIZING

Return ONLY valid JSON in this shape:
{"results":[{"chapterId":"...","verdict":"worth","reason":"..."}]}`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const json = JSON.parse(response.choices[0]?.message?.content ?? '{}')
  return json.results ?? []
}
```

### 6.2 Map API（`app/api/map/route.ts`）

```typescript
export async function POST(request: Request) {
  const { bookId } = await request.json()

  const db = createAdminClient()
  const { data: goal } = await db.from('goals').select('*').eq('book_id', bookId).single()
  if (!goal) return NextResponse.json({ error: 'No goal set' }, { status: 403 })  // Rule 1

  // 先查缓存
  const { data: cached } = await db
    .from('chapter_maps')
    .select('*')
    .eq('book_id', bookId)
    .eq('goal_id', goal.id)
  if (cached && cached.length > 0) {
    return NextResponse.json({ results: cached })
  }

  // 调 AI
  const { data: chapters } = await db
    .from('chapters')
    .select('id, seq, title, content')
    .eq('book_id', bookId)
    .order('seq')

  const results = await mapChapters(
    goal.text,
    (chapters ?? []).map((c) => ({
      id: c.id,
      seq: c.seq,
      title: c.title,
      firstParagraph: c.content.slice(0, 500),
    })),
  )

  // 写缓存
  await db.from('chapter_maps').insert(
    results.map((r) => ({
      book_id: bookId,
      goal_id: goal.id,
      chapter_id: r.chapterId,
      verdict: r.verdict,
      reason: r.reason,
    })),
  )

  return NextResponse.json({ results })
}
```

### 6.3 Screen 3 页面（`app/b/[bookId]/map/page.tsx`）

```tsx
'use client'
export default function MapPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  const [goal, setGoal] = useState('')
  const [results, setResults] = useState<MapResult[] | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [targetChapter, setTargetChapter] = useState<string | null>(null)
  const [mode, setMode] = useState<'read' | 'brief' | null>(null)

  useEffect(() => {
    // 加载 goal + 章节 + 映射
    fetch(`/api/map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId }),
    }).then((r) => r.json()).then(setResults)
  }, [bookId])

  function handleChapterAction(chapterId: string, chosenMode: 'read' | 'brief') {
    // 登录闸门
    setTargetChapter(chapterId)
    setMode(chosenMode)
    setShowLogin(true)
  }

  return (
    <main>
      <p>Based on what you said: "<em>{goal}</em>"</p>
      <h2>Here's how this book maps to your goal:</h2>

      <Section title="✅ Worth reading for you">
        {results?.filter(r => r.verdict === 'worth').map((r) => (
          <ChapterCard
            key={r.chapterId}
            result={r}
            onRead={() => handleChapterAction(r.chapterId, 'read')}
            onBrief={() => handleChapterAction(r.chapterId, 'brief')}
          />
        ))}
      </Section>

      <CollapsibleSection title="❌ Not for your goal — skip these">
        {results?.filter(r => r.verdict === 'skip').map(/* ... */)}
      </CollapsibleSection>

      <Section title="⚠️ Your goal — but this book may not answer it">
        {results?.filter(r => r.verdict === 'unanswered').map(/* ... */)}
      </Section>

      <button onClick={() => history.back()}>✏️ Edit my goal</button>

      {showLogin && (
        <LoginModal onSuccess={() => {
          // Session → User 迁移
          fetch('/api/claim', { method: 'POST' })
            .then(() => {
              window.location.href = `/b/${bookId}/${mode}/${targetChapter}`
            })
        }} />
      )}
    </main>
  )
}
```

---

## Phase 7 — 登录 Modal + Session → User 迁移

用户在 Screen 3 点击 "Read / Brief" 之前未登录。登录成功后要把 session 书 **认领** 到 user 账户。

### 7.1 Claim API（`app/api/claim/route.ts`）

```typescript
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = await getSessionId()
  if (!sessionId) return NextResponse.json({ claimed: 0 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('books')
    .update({ owner_id: user.id, session_id: null })
    .eq('session_id', sessionId)
    .is('owner_id', null)
    .select('id, storage_path')

  if (error) throw error

  // 把 Storage 里的 PDF 从 session/xxx 挪到 user/{uid}
  for (const book of data ?? []) {
    const newPath = book.storage_path.replace(/^session\/[^/]+\//, `user/${user.id}/`)
    await db.storage.from('pdfs').move(book.storage_path, newPath)
    await db.from('books').update({ storage_path: newPath }).eq('id', book.id)
  }

  return NextResponse.json({ claimed: data?.length ?? 0 })
}
```

### 7.2 登录 Modal → Callback → Claim 的时序

```
User on Screen 3 (未登录)
  ↓ 点击 "Brief Chapter 3"
LoginModal 弹出
  ↓ 选 Google
redirect to Google OAuth
  ↓ 回到 /auth/callback?next=/b/xxx/map
Callback exchanges code for session
  ↓
NextResponse.redirect('/b/xxx/map')   ← 回到 Screen 3
  ↓ 页面 onMount 时调用 /api/claim
Session books → user.id
  ↓ 跳转到 /b/xxx/brief/chapterId
```

重点：**callback 不能直接跳 brief/read**，必须先回 map 页让 claim 跑完。claim 完了前端再跳。

---

## Phase 8 — Screen 4B: Brief 模式（Rule 3）

### 8.1 AI Briefer（`lib/ai/briefer.ts`）

```typescript
import 'server-only'
import OpenAI from 'openai'

const BRIEF_SCHEMA = {
  type: 'object',
  required: ['one_sentence', 'key_claims', 'example', 'not_addressed'],
  additionalProperties: false,
  properties: {
    one_sentence: { type: 'string', maxLength: 200 },
    key_claims: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', maxLength: 180 },
    },
    example: { type: 'string', maxLength: 400 },
    not_addressed: { type: 'string', maxLength: 300 },
  },
} as const

export async function briefChapter(goal: string, chapterTitle: string, content: string) {
  const prompt = `You are writing a structured reading note.

READER'S GOAL:
"${goal}"

CHAPTER: ${chapterTitle}

CHAPTER CONTENT:
${content.slice(0, 12000)}

Output a 4-part brief. STRICT STRUCTURE — NO PROSE:

1. one_sentence: The one-sentence version of this chapter's core claim.
2. key_claims: Exactly 3 claims the author makes. Each < 180 chars.
3. example: One concrete example the author uses. < 400 chars.
4. not_addressed: What the author does NOT address, that the reader might expect. < 300 chars.

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

### 8.2 Screen 4B 页面（`app/b/[bookId]/brief/[chapterId]/page.tsx`）

严格渲染 4 段式。**Rule 4**：底部只有一个按钮，不提供返回。

```tsx
<main>
  <h1>Chapter {seq}: {title}</h1>

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

  <Warning>
    ⚠️ Reading a brief is not understanding. Now you need to do the work.
  </Warning>

  {/* 只有这一个按钮 */}
  <Link href={`/b/${bookId}/restate/${chapterId}`}>
    Now I'll restate this in my own words →
  </Link>
</main>
```

---

## Phase 9 — Screen 5: Restate + 挑错

### 9.1 AI Checker（`lib/ai/checker.ts`）

```typescript
const CHECK_SCHEMA = {
  type: 'object',
  required: ['got_right', 'missed', 'follow_up'],
  additionalProperties: false,
  properties: {
    got_right: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    missed: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    follow_up: { type: 'string', maxLength: 200 },
  },
} as const

export async function checkRestate(
  chapterContent: string,
  userRestate: string,
) {
  const prompt = `You are a strict but not harsh tutor. A reader has just restated
a book chapter in their own words. Your job is to check their understanding.

CHAPTER CONTENT:
${chapterContent.slice(0, 12000)}

READER'S RESTATEMENT:
${userRestate}

Output:
1. got_right: Specific points the reader captured correctly (up to 5, each brief)
2. missed: Important things they missed or misunderstood (up to 5, each 1-2 sentences,
   be specific — not "you missed some key ideas" but "you didn't mention that the
   author distinguishes X from Y")
3. follow_up: ONE optional follow-up question that would deepen understanding,
   Feynman-style (e.g. "Can you explain X without using the word Y?")

Rules:
- DO NOT give psychological evaluations ("great try!", "you're doing well")
- DO NOT paraphrase the chapter — quote or describe specifics
- If the reader nailed it, got_right can be 3-5 items and missed can be empty[]
- Be specific. Useless: "you missed some context". Useful: "you didn't mention
  the author's distinction between observational and experimental data"

Return JSON only.`

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'check', strict: true, schema: CHECK_SCHEMA },
    },
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  })

  return JSON.parse(response.choices[0]?.message?.content ?? '{}')
}
```

### 9.2 Screen 5 页面逻辑

```tsx
'use client'
export default function RestatePage({ params }: Props) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<CheckResult | null>(null)

  async function submit() {
    if (text.trim().length < 30) return
    const res = await fetch('/api/check', {
      method: 'POST',
      body: JSON.stringify({ chapterId, text }),
    })
    setResult(await res.json())
  }

  if (!result) {
    return (
      <main>
        <h1>Now restate Chapter {seq} in your own words.</h1>
        <p>Don't paraphrase the AI. Use your own language, your own analogies.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={text.trim().length < 30} onClick={submit}>
          Check my understanding →
        </button>
      </main>
    )
  }

  return (
    <main>
      <Section label="Where you got it right:">
        <ul>{result.got_right.map((s, i) => <li key={i}>✓ {s}</li>)}</ul>
      </Section>
      <Section label="Where you missed something important:">
        <ul>{result.missed.map((s, i) => <li key={i}>✗ {s}</li>)}</ul>
      </Section>
      {result.follow_up && (
        <Section label="Optional follow-up question:">
          <p>{result.follow_up}</p>
        </Section>
      )}
      <Link href={`/b/${bookId}/map`}>Got it. Next chapter →</Link>
      <Link href="/library">I'm done with this book</Link>
    </main>
  )
}
```

---

## Phase 10 — Screen 4A: Read 模式（AI 静默）

**Screen 4A 最后做。** 要写 react-pdf viewer、文字选区监听、侧边栏交互，是整个产品里最复杂的一屏。但优先级最低——因为 Brief + Restate 已经能闭环。

### 10.1 PdfViewer 组件

```tsx
'use client'
import { Document, Page, pdfjs } from 'react-pdf'
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export function PdfViewer({ url, pageRange }: { url: string; pageRange: [number, number] }) {
  const [numPages, setNumPages] = useState<number>(0)
  return (
    <div className="pdf-container" onMouseUp={handleSelection}>
      <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
        {Array.from({ length: pageRange[1] - pageRange[0] + 1 }, (_, i) => (
          <Page key={i} pageNumber={pageRange[0] + i} />
        ))}
      </Document>
    </div>
  )
}

function handleSelection() {
  const sel = window.getSelection()?.toString().trim()
  if (sel && sel.length > 10) {
    // 通过 context/state 把选中文字传给侧边栏
    window.dispatchEvent(new CustomEvent('pdf:selection', { detail: sel }))
  }
}
```

### 10.2 Ask API（`app/api/ask/route.ts`）

```typescript
// 用户在 Read 模式里选中一段文字 + 点 "Highlight & Ask"
// 返回 AI 对这一小段的解释
export async function POST(request: Request) {
  const { chapterId, selection, question } = await request.json()
  // ... 检查 auth + goal
  // prompt: 解释这段话，不要总结整章
  // return short answer
}
```

### 10.3 侧边栏 3 个组件

- **Highlight & Ask**：用户选中文字 → 显示 inline 按钮 → 点击后发 `/api/ask`
- **Note to self**：用户写自己的理解，保存到 `notes` 表（新加一张）
- **Check my understanding**：用户写一段理解 → 发给 `/api/check`（和 Screen 5 共用）

> 为了 MVP 先只做 Highlight & Ask。Note 和 Check 可以放到 v1.1。

---

## Phase 11 — /library 页面

登录后用户看自己的书列表。**最简实现**（spec §Login → Library 只要求缩略图 + 标题 + 作者 + 上次进度）。

```tsx
export default async function LibraryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const db = createAdminClient()
  const { data: books } = await db
    .from('books')
    .select(`
      id, title, author, page_count, created_at,
      restatements ( chapter_id, created_at )
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1>Your Library</h1>
      {books?.map((b) => (
        <Link key={b.id} href={`/b/${b.id}/map`}>
          <div>
            <h3>{b.title}</h3>
            <p>{b.author}</p>
            <p>Last active: {lastActive(b.restatements)}</p>
          </div>
        </Link>
      ))}
    </main>
  )
}
```

不做：搜索、标签、筛选、统计图表、分享。

---

## Phase 12 — Session PDF 24h 清理 Cron

### 12.1 `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/cleanup", "schedule": "0 1 * * *" }
  ]
}
```

Hobby plan 只支持每日一次，够用。

### 12.2 Cleanup Route

```typescript
// app/api/cron/cleanup/route.ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // 找所有未认领且过期的 session books
  const { data: orphans } = await db
    .from('books')
    .select('id, storage_path')
    .is('owner_id', null)
    .lt('created_at', cutoff)

  // 删 Storage
  if (orphans && orphans.length > 0) {
    await db.storage.from('pdfs').remove(orphans.map((b) => b.storage_path))
    await db.from('books').delete().in('id', orphans.map((b) => b.id))
  }

  return Response.json({ deleted: orphans?.length ?? 0 })
}
```

---

## Phase 13 — Vercel 部署

### 13.1 环境变量

在 Vercel Dashboard → Settings → Environment Variables 填入（见 Phase 0.4 清单）。

**特别注意**：`NEXT_PUBLIC_APP_URL` 生产要填 `https://vibereading.vercel.app`（或自定义域名）。

### 13.2 Build Command

用 **默认** `next build`。**不需要** `prisma generate`（Supabase-only 模式）。

### 13.3 Google OAuth Redirect URL

上线后要在：
- **Supabase Dashboard → Authentication → URL Configuration**：添加 `https://<your-domain>/auth/callback`
- **Google Cloud Console → OAuth credentials**：Authorized redirect URIs 加 `https://<supabase-project>.supabase.co/auth/v1/callback`

### 13.4 Deploy

```bash
git push   # 推到 main 自动触发 Vercel 部署
```

---

## 常见坑（继承 STANDARD + Vibe Reading 专属）

| 坑 | 原因 | 解法 |
|----|------|------|
| Supabase Storage bucket 公开了 | 默认 public | 建 bucket 时选 private；用 signed URL 提供访问 |
| PDF 解析 OOM | 大 PDF 一次加载全部文本 | 限制 50MB，流式解析，章节切分后才存数据库 |
| 章节切分全炸 | 书没有清晰的"Chapter N" 标题 | 用 fallback split 按段落切；未来用 AI 切分（v1.1） |
| Screen 3 AI 超时 | 一次把全书内容塞进 prompt | 只传章节标题 + 前 500 字（见 `ChapterInput`） |
| Rule 1 被绕过 | 用户直接访问 `/b/xxx/map` 跳过 goal | middleware / 页面组件第一步检查 goal，没有就 redirect |
| Rule 3 Brief 输出散文 | 没用 JSON schema | 用 OpenAI `response_format: json_schema` + strict |
| Rule 4 用户点浏览器返回逃跑 | 浏览器返回总是能用 | 接受这个——不强行拦浏览器返回，但 UI 不提供按钮 |
| 登录后丢失 map 上下文 | callback 直接跳 /library | callback 必须用 `?next=` 参数回原路径 |
| Session book 孤儿堆积 | 24h cron 没跑 | 每周检查一次 Vercel Cron 日志；用 SQL 算孤儿数 |
| PDF viewer worker 报错 | `pdfjs.GlobalWorkerOptions.workerSrc` 没设 | 用 CDN worker（见 Phase 10.1）|

---

## 环境变量完整清单

```bash
# Supabase (Phase 0)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI (Phase 6, 8, 9, 10)
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=

# Cron (Phase 12)
CRON_SECRET=
```

> 无 `DATABASE_URL`（Supabase-only）
> 无 Stripe 变量（开源，MVP 全免费）
> 无 Resend（MVP 不发邮件；未来加 magic link 或 digest 再加）

---

## 新项目 Checklist

```
□ npx create-next-app vibe-reading --typescript --tailwind --app
□ npx shadcn@latest init
□ npm install @supabase/supabase-js @supabase/ssr pdf-parse react-pdf openai
□ 复用 launchradar 的 Supabase project —— 从 launchradar/.env.local 复制 URL / anon key / service role key
□ Supabase Dashboard → Project Settings → API → Exposed schemas 里加 `vr` → Save
□ Storage bucket：Phase 4 实现上传时再决定
□ 跑 Phase 2 的 SQL（在 `vr` schema 下建所有表 + 启用 RLS + policies）
□ 跑 npm run db:types 生成 TypeScript 类型（记得 `--schema vr`）
□ 创建 lib/supabase/client.ts + server.ts + admin.ts（照 STANDARD 3.1 + §3.0 的 `db: { schema: 'vr' }` 配置）
□ 创建 middleware.ts（Phase 3.2 的变体）
□ 创建 app/auth/login + register + callback（Phase 3.4 + 3.5）
□ 实现 Phase 1: Landing + UploadDropzone + SessionId cookie
□ 实现 Phase 4: /api/upload + PDF parser + 章节切分
□ 实现 Phase 5: Screen 2 goal 输入 + Rule 1 硬卡点
□ 实现 Phase 6: Screen 3 三色映射 + Rule 2 prompt 约束
□ 实现 Phase 7: LoginModal + /api/claim
□ 实现 Phase 8: Screen 4B Brief + JSON schema 强制
□ 实现 Phase 9: Screen 5 Restate + 挑错
□ 自测第一本书：完整走一遍 Upload → Goal → Map → Brief → Restate
□ 实现 Phase 10: Screen 4A Read 模式（可选，MVP 不强求）
□ 实现 Phase 11: /library
□ 配置 Vercel 环境变量（见清单）
□ 配置 Phase 12: cron cleanup + vercel.json
□ 配置 Google OAuth redirect URL（Supabase + Google Console）
□ 部署 → 生产环境跑一遍完整流程
□ 复制 sprint-report.yml + notify-playbook.yml → .github/workflows/
□ 更新 notify-playbook.yml 中的 project_id = "vibe-reading"
□ GitHub Secrets 加 PLAYBOOK_TOKEN
```

---

## 成功判定

参照 `ideas/vibe-reading.md` §Success Criteria：

**Week 1**：作者自测 — 用这个 MVP 读完 1 本自己真想读的书。如果比 ChatPDF / NotebookLM 差 → MVP 失败，回炉。

**Week 2-4**：5-10 个朋友试用 — 看他们在 Screen 2 写得出需求吗？在 Screen 5 真的会打字复述吗？如果大部分人跳过 Screen 2 或 Screen 5，说明方法论太理想化，重新设计。

---

## Sprint Summary

_This section will be auto-updated by the sync-from-projects workflow once the repo is created._
