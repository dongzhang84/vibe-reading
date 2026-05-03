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

整个 v2 系统拆成 4 条独立的技术 pipeline，下面这张图给一个鸟瞰。先看图建立全局心智模型，再往下读 Phase 0-14 的细节实现。

![Vibe Reading technical pipeline](../diagram/tech-pipeline/diagram.svg)

**4 条 pipeline 与 Phase 的对应关系**：

| Pipeline | 何时触发 | 涉及的 Phase | LLM 调用形态 |
|---|---|---|---|
| **A · Intake** | 用户上传一本新书 | Phase 6（Upload + intake AI） | 1 次 / 本书 |
| **B · Question** | 用户在 Book Home 提交一个问题 | Phase 7 + Phase 8 | 1 次 / 问题（~3s） |
| **C · Brief** | 用户在 Question Result 左栏点 [Brief] | Phase 10 | 1 次 / 章节，cache 永久 |
| **D · Read** | 用户在 Question Result 左栏点 [Read]（含可选的 Highlight & Ask） | Phase 12 | 0–N 次 / 高亮 |

**核心选型**：所有 LLM 调用都走 OpenAI `gpt-4o-mini` + JSON schema strict 模式。**没有 vector DB、没有 embeddings、没有 RAG 框架**——只有 `pdfjs` 抽结构 + 4 类 narrow LLM call。详细 prompt 设计在各 Phase 内。

> **i18n 约定**（2026-04-30 patch）：四个 LLM 调用都被显式约束**输出语言跟数据源走**，而不是默认英文。具体规则：
> - `intake` (§6.3) → overview + 推荐问题 跟 **书的正文**（intro/conclusion）语言走
> - `relevance` (§8.1) → 章节匹配 reason 跟 **用户提问** 语言走（中文问 → 中文 reason）
> - `briefer` (§10.1) → 4 段式 brief 跟 **章节内容** 语言走
> - `asker` (§12.2) → 划词解释跟 **高亮段落** 语言走
>
> 每个 prompt 都加了一行 `LANGUAGE:` 规则 + （relevance 还加了"可能包含 / 讨论了 / 涉及 / 介绍了"的中文 few-shot）。原因：prompt 主体 + 示例都是英文，模型默认会把输出对齐到 prompt 语言；不显式 override 就拿不到中文输出，即便给的是中文章节。中英文混排的书按主导语言走。

---

## Phase Mapping to STANDARD §11

本 guide 的 Phase 编号严格对齐 [`indie-product-playbook/stack/STANDARD.md`](../../indie-product-playbook/stack/STANDARD.md) §11 的脚手架。这份文件本身被作为**模板**使用 —— 后续 indie 项目的 implementation-guide 直接 copy 这套结构。

| STANDARD §11 / §12     | 本项目对应                                                  |
|------------------------|-------------------------------------------------------------|
| Phase 0 Bootstrap      | Phase 0 — 项目初始化                                        |
| Phase 1 Scaffold       | Phase 1 — Landing + Upload (Screen 1) + 壳                  |
| Phase 2 Vercel deploy  | Phase 2 — 首次 Vercel 部署                                  |
| Phase 3 v0 Polish      | Phase 3 — v0 Polish + Token Lockin                          |
| Phase 4 DB + Auth      | Phase 4 — DB + Auth (4A: Schema · 4B: Auth flow)            |
| Phase 5 Stripe (rare)  | (本项目跳过；Day 1 不收费。如未来要收费走 §12.D)              |
| Phase 6-N Business     | Phase 6-14 (PDF parsing · Book Home · Q Result · Brief · Read · Library · Cron …) |
| **§12.A UAT (solo)**   | 创始人 dogfood —— 你自己用 MVP 读完一本真想读的书；过 → 进 §12.B |
| **§12.B Custom Domain**| ✅ 切完（2026-05-02）—— `vibe-reading.dev`（apex 主，`www` 307 → apex）；原 `*.vercel.app` 仍可访问 |
| **§12.C Scale-up**     | TBD —— 邀请朋友 / 开放陌生人之前做（rate limit · Sentry · cost cap · Posthog · storage audit） |
| **§12.D Stripe**       | TBD —— spec 决定 MVP 全免费；如未来引入付费走 §6 Stripe 模块 |

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
- **Storage bucket**：`vr-docs`（Phase 6 实现上传时再建，不做 `pdfs` 因为留空间给未来非 PDF 文档）
- **跳过的 provider**：GitHub OAuth / Magic Link / 其他

### Step 3: 目录结构（v2）

```
vibe-reading/
├── app/
│   ├── api/
│   │   ├── upload/init/route.ts       ← issue Supabase signed upload URL (≤ 几 KB body)
│   │   ├── upload/finalize/route.ts   ← pull PDF from Storage → parse + intake AI
│   │   ├── question/route.ts          ← 提交 question → 触发 relevance → 写 question_chapters
│   │   ├── question/[id]/retry/      ← 0-match 重试，重跑 relevance 替换 question_chapters
│   │   ├── brief/route.ts             ← [Brief] 触发点（chapter-level，缓存）
│   │   ├── ask/route.ts               ← [Read] pane 里的 Highlight & Ask
│   │   ├── books/[id]/route.ts        ← DELETE：删书 + cascade + Storage 清
│   │   ├── check/route.ts             ← ⚠️ Reserved v1.1（UI 不调用）
│   │   ├── claim/route.ts             ← session → user 迁移（登录前上传的书归属）
│   │   └── cron/cleanup/route.ts      ← 24h 未认领 session book 清理
│   ├── auth/
│   │   ├── login/page.tsx             ← Notion-warm UI + BookOpen brand
│   │   ├── register/page.tsx          ← 同上
│   │   └── callback/route.ts          ← OAuth 回跳 + 内联 claim
│   ├── b/[bookId]/
│   │   ├── page.tsx                   ← Screen 2: Book Home
│   │   └── q/[questionId]/page.tsx    ← Screen 3: Question Result (分屏)
│   ├── library/page.tsx               ← server: 读 books → 喂 LibraryList
│   ├── page.tsx                       ← Screen 1 (Landing + Upload)
│   └── layout.tsx                     ← 根 layout：Nav + dark-mode FOUC 脚本
├── components/
│   ├── Nav.tsx                        ← 全站 sticky nav，pathname 自隐藏
│   ├── ThemeToggle.tsx                ← Sun/Moon 切换，写 localStorage('vr-theme')
│   ├── UploadDropzone.tsx             ← drag-drop + Notion-warm 视觉
│   ├── UploadCtaButton.tsx            ← Landing CTA 按钮（小 client wrapper）
│   ├── LoginModal.tsx                 ← (Reserved) 登录 modal，v2 没在用
│   ├── BookHomeScreen.tsx             ← TOC + question input + suggestions + history
│   ├── QuestionResultScreen.tsx       ← 左右分屏容器
│   ├── ChapterListPane.tsx            ← 左栏：matched chapters + [Brief]/[Read] + 0-match Retry
│   ├── BriefPane.tsx                  ← 右栏 Brief 4 段式
│   ├── ReadPane.tsx                   ← 右栏 PDF viewer + Highlight & Ask
│   ├── PdfViewer.tsx                  ← react-pdf：zoom + 键盘 + 跳页 + lazy mount
│   ├── LibraryList.tsx                ← /library 客户端列表 + 删书菜单
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

> **2026-04-30 重写**：从单次 multipart POST 改为 3 阶段直传。理由见 §6.4。

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Phase = 'starting' | 'transferring' | 'analyzing'

export function UploadDropzone() {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'uploading'; phase: Phase } | ...>({ kind: 'idle' })

  async function handleFile(file: File) {
    if (file.size > 50 * 1024 * 1024) { alert('Max 50MB'); return }
    if (file.type !== 'application/pdf') { alert('PDF only'); return }

    // Phase 1 — ask server for a signed upload URL
    setState({ kind: 'uploading', phase: 'starting' })
    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size }),
    })
    const { storagePath, token } = await initRes.json()

    // Phase 2 — client uploads the PDF directly to Supabase Storage,
    // bypassing the Vercel function entirely.
    setState({ kind: 'uploading', phase: 'transferring' })
    const supabase = createClient()
    const { error: putErr } = await supabase.storage
      .from('vr-docs')
      .uploadToSignedUrl(storagePath, token, file, { contentType: 'application/pdf' })
    if (putErr) { /* show diag and return */ }

    // Phase 3 — server pulls the file back, parses, runs intake AI,
    // writes book + chapters rows, returns bookId.
    setState({ kind: 'uploading', phase: 'analyzing' })
    const finalizeRes = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storagePath, filename: file.name }),
    })
    const { bookId } = await finalizeRes.json()
    window.location.href = `/b/${bookId}`
  }

  return (/* drop UI + 3-phase progress label */)
}
```

UX 上 dropzone 显示三段不同的 label：`Preparing upload… → Uploading to storage… → Analyzing your book…`，让用户知道大文件传输那段（Phase 2）正在进行而不是卡死。每个 phase 旁边带一个 `(Ns)` 实时秒计数器（`phaseStartedAt` 入 state，`now` 由 1s `setInterval` 驱动，phase 切换时归零）。**Phase 3 内部** label 还会基于 elapsed 时间继续轮换（顺序对齐服务端 pipeline）：

```
0–4s   → "Reading the book outline…"
4–10s  → "Mapping chapter boundaries…"
10–20s → "Drafting your starter questions…"
20s+   → "Almost done…"
```

不是真的服务端事件（finalize 是单次 fetch），但顺序匹配 server 端 outline → chapter slice → intake AI 的实际工作顺序，所以感知和真实节奏对得上。错误时显示真实 HTTP 状态码 + size + 耗时（不再 fallback 到模糊的 "Upload failed"）。

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

## Phase 2 — 首次 Vercel 部署

**关键原则**：Phase 1 的 landing 一可见就立刻部到 Vercel。早部 = 早发现 env vars 漏配 / Build Command 错 / runtime 问题。Auth / Stripe / 业务逻辑都还没写完也无所谓 —— 这一步的目的是**验证部署 pipeline**，不是验证产品。

### 2.1 首次部署

```
[Human] Vercel Dashboard → New Project → Import Git Repository → vibe-reading
[Human] Framework: Next.js → Deploy
[Human] Settings → Environment Variables → "Paste .env" 粘凭据（GITHUB_TOKEN 除外）
[Human] NEXT_PUBLIC_APP_URL = 生产 URL
[Human] Deployments → 最新 → Redeploy（让 env 生效）
[Human] 打开线上 URL 实测 landing 渲染 ≠ "Deploy Ready"，必须 runtime 通过
```

### 2.2 Build Command

默认 `next build`（Supabase-only，无 Prisma）。不改。

### 2.3 后续每次 push 自动 redeploy

`git push main` → 自动构建 + 替换生产 deployment。Env vars 改了要**手动 Redeploy**（Dashboard → Deployments → ⋯ → Redeploy 或推一个空 commit），这是 Vercel 的硬约束（STANDARD §5.1.2）。

### 2.4 OAuth Redirect URL（首次 prod 部署后一次性加）

```
[Human] Supabase Dashboard → Auth → URL Configuration → Redirect URLs
        加 `https://<your-domain>/auth/callback`
```

Google Cloud Console **不用动** —— OAuth Client 的 Authorized redirect URIs 配的是 `https://<supabase-ref>.supabase.co/auth/v1/callback`（Supabase 侧回调），跟 Vercel 域名无关。

> Phase 4B (Auth) 还会再用到这个，那时候已经部署过、生产 URL 已知。

### 2.5 Custom Domain（已切完 — 2026-05-02）

Phase 2 用 Vercel 自动给的 `*.vercel.app` 即可，**不要**这一步就买 / 切自定义域名。理由：产品名 / brand 在写业务代码过程中常会调整；UAT 没通过的话产品方向都还可能调；过早绑死 custom domain 会让任何方向调整都多一遍 DNS + Supabase + OAuth env 迁移成本。

等 MVP 上线、§12.A UAT 通过、brand 定型之后，按 [`STANDARD.md` §12.B](../../indie-product-playbook/stack/STANDARD.md) 的 Vercel + Namecheap + Supabase Auth 全套迁移流程一次性切。该节附带"踩过的坑"清单（www 子域 OAuth 转圈、HTTPS Let's Encrypt 等待、env-without-redeploy、第三方 TOML config 漏改等）。

vibe-reading 实际执行（2026-05-02）：买了 `vibe-reading.dev`（带连字符跟整个 repo / Vercel project / 文档命名一致；`vibereading.dev` 被划进 Google Registry premium 拿不到合理价）。Vercel 加 domain 时勾"redirect www → apex"，apex 当主、www 307 跳转。Namecheap Advanced DNS 删 parking 记录后加 Vercel 给的 A + CNAME。Supabase Auth Site URL 改为 `https://vibe-reading.dev`，Redirect URLs 加 `/auth/callback` 的 apex + www 两条。代码 0 改动（`NEXT_PUBLIC_APP_URL` 当前没被代码引用，metadata 也无 `metadataBase`）；只动 4 个文档里的 live URL 文案。原 `vibe-reading-iota.vercel.app` 保持可访问。

---

## Phase 3 — v0 Polish + Token Lockin

**关键原则**：Phase 1 的 landing 是 raw shadcn 模版，跟正式产品的视觉气质有距离。**赶在写业务代码之前**用 v0 重做一版 landing，把 token 系统在这一步定型 —— 颜色（含 dark mode）、radius scale、字体层级、按钮 / 卡片基样式。后面 Phase 6-14 写每个新屏直接复用同一组 token，不用回头大改。

vibe-reading 的反例：早期跳过这一步直接做完所有业务屏，再大改一次视觉，回头改了 5+ 个屏，重活。**这一节就是为了避免别的项目重复这个错误而加的**。

### 3.1 v0 投喂

```
[Human] v0.dev 给 prod URL（Phase 2 已部署）+ design brief
        brief 必须包含：
          - locked constraints：单 accent / no framer-motion / 用 CSS token
            而非 hardcoded color / sentence case
          - desired vibe：选一个参照（Notion / Linear / Vercel docs / 等）
          - 必保留：上传 / 登录入口 / 现有交互
[Human] 从 v0 拿 .tsx 全文，paste 给 Claude
```

### 3.2 转译集成（4 步关键，每一步都不能省）

```
[AI] 1. hardcoded color (slate-500 / blue-500) → CSS token
       (text-muted-foreground / bg-primary)
[AI] 2. 拆 page / Screen 分层（v0 输出是单文件 + mock data）
       page 留 server-side fetch，Screen 留 'use client'
[AI] 3. 接真实数据 / 交互（v0 用 mock）
[AI] 4. 删冗余依赖（framer-motion / 多余 lucide icon / 任何 v0 自动引的库）
```

### 3.3 Token 落地到 `app/globals.css`

```
[AI] :root 完整 light tokens
[AI] .dark 完整 dark tokens（即使现在不开 toggle，也先写好；后面加 toggle 是 5 分钟事）
[AI] --radius / --font / 其他基础变量
```

vibe-reading 实际用的 token 套（仅供参考）：warm-cream bg + slate-blue fg + warm-orange accent（仅 eyebrow 用），oklch 色彩空间，`--radius: 0.75rem`。详细 token 表见 [`docs/ui-design-report.md`](./ui-design-report.md) §2.1。

### 3.4 Dark mode toggle（可选，建议同步做）

```
[AI] components/ThemeToggle.tsx —— Sun/Moon 按钮
[AI] 在 app/layout.tsx <head> 内联 FOUC-prevention 脚本：
     在 React hydrate 之前就根据 localStorage('vr-theme') 或
     prefers-color-scheme 把 dark class 挂上 <html>
[AI] Nav 末尾挂 ThemeToggle
```

### 3.5 部署 + 实测

```
[AI]    git push → Vercel 自动 redeploy
[Human] 浏览器 light + dark prod URL 各实测一遍
```

### 3.6 Lock-down 规则

写进 design brief 也好，集成时强制也好，这几条**永远**不破：

- v0 输出 ≠ 直接 commit。**永远**经过 §3.2 的转译 pass
- 不引第二条 accent ramp（保持单 accent）
- 不引动画库（只用 Tailwind hover transition）
- v0 的 hero illustration / SVG 装饰元素默认删掉
- 现有 auth 流 / upload 流的交互**不能动**（功能优先）

### 何时跳过 Phase 3

- 内部工具 / 不公开的项目（直接用 shadcn 默认即可）
- 已有强设计系统的项目（v0 会和现有 token 打架）
- 极简 CLI / API 类项目（无前端需要抛光）

vibe-reading 不属于上述任何一类，所以 Phase 3 是必经步骤。

---

## Phase 4 — DB + Auth

DB schema 和 Auth 流程合在一个 Phase 下，分两个子节做：4A 建表，4B 接 Auth。两步可以串行（Schema 先 → Auth 后），也可以一次 push（Phase 4A 的 SQL 跑了之后 Auth 代码再 commit）。

### Phase 4A — 数据库 Schema (v2)

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

### Phase 4B — Auth（Email/Password + Google）

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

### 4B.0 所有 createClient 必须指定 schema + Database 泛型

```typescript
import type { Database } from '@/types/db'

createBrowserClient<Database, 'vr'>(url, key, { db: { schema: 'vr' } })
createServerClient<Database, 'vr'>(url, key, { cookies: {...}, db: { schema: 'vr' } })
createClient<Database, 'vr'>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'vr' },
})
```

### 4B.1 OAuth provider 选择（决定要不要砍 GitHub）

STANDARD §3.2 的 login 页默认提供 **Email/Password + Google + GitHub** 三选一。是否保留 GitHub 取决于**目标用户**：

| 目标用户 | GitHub OAuth | 理由 |
|---|---|---|
| 开发者 / 技术 audience（dev tools、API 类、indie hacker 工具） | ✅ **保留** | 开发者已经有 GitHub 账号，用它登录最低摩擦；某些场景（开源贡献流、IDE 集成）后续还需要 GitHub token |
| 非技术 audience（普通 reader、消费者、creator 工具…） | ❌ **砍掉** | 大部分人没 GitHub 账号，多一个看不懂的按钮 = 多一道流失漏斗 |

**Vibe Reading 的选择**：砍掉 GitHub。读书工具的目标用户是"严肃读者"——研究者 / 产品经理 / 工程师都有，但**也包括非技术读者**。GitHub 按钮对非开发者是认知噪音，所以这个 MVP 只保留 Email/Password + Google。

如果你是用这套 guide 做开发者向工具，**不要砍**：保留 STANDARD §3.2 原样的三按钮 login 页。

---

### 4B.2 Middleware 路由保护（v2 改动）

```typescript
// v2: Book Home + Question Result 都要登录（整个 /b/* 都保护）
const PROTECTED_ROUTES = ['/library']
const BOOK_ROUTES = /^\/b\/[^/]+/   // /b/:id 和 /b/:id/q/:qid 都要登录
```

**与 v1 区别**：v1 里 `/b/:id/goal` 和 `/b/:id/map` 是公开的（登录点在 Map → Brief 之间）。v2 里整个 `/b/*` 都挡 —— 登录时机前置到 Upload → Book Home 之间。

### 4B.3 不创建 Profile 表

Vibe Reading schema 没有 Profile 表 —— 用户信息直接用 `auth.users`。STANDARD §3.3 的 upsert Profile 代码不要复制。

### 4B.4 Login Modal（不是 full page）

Upload 成功后如果未登录：在 landing 上弹 LoginModal，回调 `?next=/b/:id`。登录成功 → callback 内联 claim → 跳 `/b/:id`。

**文案必须写清楚"登录 = 创建账号"**（STANDARD §3.2 UX 铁律）：
1. Subtitle: `Sign in, or create an account — same modal. This is the only time we'll ask.`
2. Google 按钮下方: `First time? Continue with Google creates your account automatically.`
3. 底部: `No account yet? [Sign up with email →](/auth/register?next=<same returnTo>)`

### 4B.5 Callback 支持 next 参数

`/auth/callback` 读 `?next=`，`exchangeCodeForSession` 成功后跳。防开放重定向：只接受 `/` 开头且不以 `//` 开头的同源路径。

### 4B.6 登录后 Session → User 迁移

callback 内联 claim（见 Phase 9）。`/api/claim` 作为 email 登录 path 的兜底。

---

## Phase 6 — PDF 解析 + TOC + Intake AI (v2 重写)

v2 的关键变化：
- 抓目录用 **`pdfjs.getOutline()`**（unpdf 暴露 pdfjs proxy，直接调原生 API）
- Upload API 一次性做完：**解析 PDF + 切章 + 生成 overview + 生成 3 推荐问题**
- 老的正则切章逻辑降级为 fallback（PDF 无 outline metadata 时才用）

**Storage bucket**：`vr-docs`（私有、50MB、`application/pdf` MIME 白名单）。

### 6.1 PDF Outline 抽取（`lib/pdf/outline.ts`）

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

#### 6.1.1 Chapter source level + front-matter filter（2026-04-30 patch）

实际部署后发现两类书 outline 切片会翻车，落地代码 `lib/pdf/outline.ts` 在 flatten 之后多两步处理（本节为代码现状，比上面这版 sketch 更精确）：

**Front-matter 过滤** —— 标题匹配下列模式的 entry 仍保留在 `book.toc`（Book Home 渲染 TOC 用），但**不进 `chapters` 表**（不喂给 relevance AI）：
`Cover · Title Page · Half Title · Copyright · Dedication · About the Author · Praise · Reviews · Acknowledgments · Bibliography · Glossary · Index · Notes · Colophon · 封面 · 版权 · 致谢 · 索引`。Preface / Foreword / Introduction / Epilogue **保留**——这些经常有真内容（Kuhn 的 Introduction 就是核心论点的延伸）。

**Chapter source level picker** —— 默认 level 1 当章节切片层级。但当 ≥60% 的"非 front-matter level-1 entry"匹配 Part divider 模式（`/^Part\s+[IVX\d]+/` 或 `/^第\d+(篇|部)/`）且 level-2 至少 3 条时，**descend 到 level 2**。下沉后非 Part 的 level-1 entry（比如 Preface）也会作为 chapter 一并保留，不丢内容。

**Boundary 计算** —— 切片用所有非 front-matter entry 的页码作为 boundary（不只 chosen-level）。一章在下一个 boundary 的前一页结束，所以下沉到 level 2 时一个 chapter 不会意外把下一个 Part divider 页吞进去。

**修这个的真实事件**：_Beyond Vibe Coding_（Addy Osmani）outline 是 `Cover / Preface / Part I. Foundations / [Ch1, Ch2, ...] / Part II / ...`。原代码只取 level-1 → "Part I" 一个 chapter 包含 80+ 页全部 Part 内容 → relevance AI 看每个 Part 都 "likely contains" 任何问题相关内容 → 返回 5 条全选（Part I/II/III + Cover + Preface）。Patch 后切出真正的 Chapter 1/2/3...，front-matter 不再污染候选。

### 6.2 PDF 全文 + 章节切分（`lib/pdf/parser.ts`）

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
      title: cleanStr(info?.Title) ?? deriveFromFilename(filename)?.title ?? 'Untitled',
      author: cleanStr(info?.Author) ?? deriveFromFilename(filename)?.author ?? null,
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

> **2026-04-30 patch — title fallback**：很多 PDF 的 metadata 没 Title，原代码直接 fallback 到字符串 `'Untitled'`。新版本加一层文件名兜底（`parsePdf(buffer, file.name)`）：去 `.pdf` 后缀、`_/-` 转空格、合并空白；如果文件名末尾有 `(Author Name)` 段且看起来像人名（≥3 字符、含空格、Unicode letter pattern），抽出来作为 author 候选。链路：`metadata.Title → 文件名头 → "Untitled"`，author 同理。

### 6.3 Intake AI（`lib/ai/intake.ts`）

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

### 6.4 Upload API（`app/api/upload/init` + `app/api/upload/finalize`）

> **2026-04-30 重写**：从单次 multipart POST 拆成 3 阶段直传，原因下面 callout 写清楚。

**两个 routes**：

`POST /api/upload/init` —— body `{ filename, size }`：
- Validate `.pdf` 后缀、`0 < size ≤ 50MB`
- 生成 storage path：`session/<sessionId>/<uuid>.pdf`（session-scoped，`finalize` 会校验前缀）
- 调 `db.storage.from('vr-docs').createSignedUploadUrl(path)` 拿 signed URL + token
- 返回 `{ storagePath, uploadUrl, token }`
- 函数本身极轻：几 KB body、毫秒级响应

`POST /api/upload/finalize` —— body `{ storagePath, filename }`：
- 校验 `storagePath` 以 `session/<currentSessionId>/` 开头（防止用别人的 path）
- `db.storage.from('vr-docs').download(storagePath)` 把 PDF 拉回 buffer
- 跑原来 upload route 里的全部逻辑：`extractOutlineAndChapters` → `parsePdf` → `analyzeBook` (intake AI) → insert books row + chapters rows
- 失败路径回滚 Storage blob + books row（同原来）
- 返回 `{ bookId }`

`runtime = 'nodejs'` + `maxDuration = 60`（finalize；init 用默认）。

> **为什么是 3 阶段直传，不是单次 multipart POST**
>
> Vercel **Hobby 计划的 Serverless Function request body 上限大约 4.5 MB**（AWS Lambda 同步 invoke 的 payload 限制，error code 是 `FUNCTION_PAYLOAD_TOO_LARGE`）。原来的 `POST /api/upload` 接 multipart formData 整个 PDF，任何 ≥ 5MB 左右的书在 prod 都会撞 413。Hobby 没有 config 能调高这个上限。
>
> 客户端拿 signed URL 直接 PUT 到 Supabase Storage 这条路，**完全绕过 Vercel function**：30MB 的传输走客户端 ↔ Supabase 直连。`finalize` 里 server 从 Storage **download** 文件是函数内部的 egress，不受入站 HTTP body 限制。
>
> 另外有一层是 Next.js 16 的 proxy 默认 10MB body 限制（在 `next.config.ts` 通过 `experimental.proxyClientMaxBodySize: '50mb'` 调高），那条只在本地 dev 暴露 —— prod 上是 Vercel 限制先撞。两层都要处理。

> **为什么 intake 同步跑**：reader UX 要求进入 Book Home 就看到推荐问题，不能 "parsing..." spin 10 秒再 spin 5 秒。同步跑总时长 ~8-15 秒，给 dropzone 显示 "Analyzing your book..." progress 即可。

### 6.5 Admin Client（`lib/supabase/admin.ts`）

照 STANDARD §3.1。service_role key，绕过 RLS。

---

## Phase 7 — Screen 2: Book Home（v2 NEW，取代 Goal 输入）

这是 v2 的价值兑现点：用户上传之后**第一眼**看到的就是 TOC + 推荐问题 + 输入框。

### 7.1 页面（`app/b/[bookId]/page.tsx`）

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

### 7.2 BookHomeScreen 组件结构

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

### 7.3 POST /api/question（`app/api/question/route.ts`）

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

## Phase 8 — Screen 3: Question Result + 分屏 (v2 NEW，取代 Map)

左栏：AI 匹配的章节列表；右栏：点击 [Brief] / [Read] 后加载的内容。

### 8.1 AI Relevance（`lib/ai/relevance.ts`）

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

### 8.2 Question Result 页面（`app/b/[bookId]/q/[questionId]/page.tsx`）

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

### 8.3 分屏组件（`components/QuestionResultScreen.tsx`）

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

### 8.4 ChapterListPane

渲染 matches 列表。每项：章节编号 + 标题 + AI reason + [Brief] / [Read] 两按钮。支持 `chapter_id === null` 的 book-level 条目（显示为 "📖 Book-level: read intro + conclusion"，点击跳首章）。

**头部两行 + question 文字**（2026-04-30 patch）：
1. 小的灰色 ghost link `← Library`（去 `/library`，低频"换本书"动作）
2. card-style 主按钮 `Ask another question →`（去 `/b/[bookId]` Book Home，最高频动作）
3. `YOUR QUESTION` 蓝色 eyebrow + 当前 question 文字

为什么不直接显示 `Nav`：`Nav.tsx` 的 `HIDE_PATTERNS` 故意在 `/b/[id]/q/` 隐藏全站 nav，给分屏 PDF 区域多 56px 高度。把 Library 链接放进 ChapterListPane 头部（左 pane 内）就不挤压右 pane，保留 PDF 视野。

### 8.5 BriefPane

调 `/api/brief` 拿 4 段式结果（缓存 per chapter_id），按 Rule 3 结构化渲染。见 Phase 10。

### 8.6 ReadPane

PDF viewer 从 `pageStart` 开始渲染。右侧小区块："Highlight & Ask" —— 用户在 PDF 里选中文字 → 触发 `/api/ask`。见 Phase 12。

---

## Phase 9 — 登录 Modal + Session → User 迁移（v2 简化）

**v2 关键改动**：登录时机从 Map → Brief 前移到 Upload → Book Home。其余 claim 机制不变。

### 9.1 共享 helper（`lib/auth/claim.ts`）

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

### 9.2 `/api/claim` 薄壳（兜底 Email 登录路径）

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

### 9.3 Callback 内联 claim

```typescript
// app/auth/callback/route.ts
const { data } = await supabase.auth.exchangeCodeForSession(code)
const sessionId = await getSessionId()
if (sessionId) {
  try { await claimSessionBooks({ userId: data.user.id, sessionId }) } catch {}
}
return NextResponse.redirect(`${origin}${next}`)
```

### 9.4 v2 时序

```
Landing (未登录) → drop PDF
  ↓ POST /api/upload/init (session_id 绑定，发 filename/size)
  ↓ 返回 storagePath + signed upload URL + token
  ↓ 客户端 PUT 文件直接到 Supabase Storage（绕过 Vercel function）
  ↓ POST /api/upload/finalize { storagePath, filename }
  ↓ server 从 Storage 拉文件 → parse + intake AI → 写 books + chapters
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

## Phase 10 — Brief 模式（Rule 3，挂在 QuestionResult 右栏）

### 10.1 AI Briefer（`lib/ai/briefer.ts`）

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

### 10.2 Brief API（`app/api/brief/route.ts`）

- 验 auth → 验 chapter 属于 user 的书
- 查缓存 `vr.briefs.where(chapter_id)`，命中直接返回
- 否则跑 `briefChapter`，写缓存，返回

### 10.3 BriefPane 组件

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

## Phase 11 — ⚠️ Reserved for v1.1: Restate + Check

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

## Phase 12 — Read 模式（挂在 QuestionResult 右栏）

### 12.1 PdfViewer 组件

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

### 12.2 Ask API（`app/api/ask/route.ts`）

用户在 Read pane 选中文字 → 右侧 "Highlight & Ask" 按钮激活 → 发 /api/ask。

```typescript
export async function POST(request: Request) {
  const { bookId, chapterId, selection } = await request.json()
  // 验 auth + book/chapter 所属
  // prompt: 解释这段话（只解释选中内容，不总结整章）
  // 返回短答案
}
```

### 12.3 ReadPane 组件

左栏选中、右栏 sidebar 显示历史问答。v2 视觉沿用 Notion-warm 卡片样式（Sparkles glyph + rounded-xl card）。

### 12.4 PdfViewer 现有功能（2026-04-26 后）

最初的简单封装现在长出了一组小工具，全在 `components/PdfViewer.tsx` 里：

- **Sticky toolbar**：`[ N% ]  [ Page __ / N ]      [−] [⛶] [+]`
- **缩放**：`50%` 到 `300%`，每次 `±10%`，"⛶" 一键 fit-width（基于 `ResizeObserver` 测的容器实时宽度，所以收侧栏 / 改窗口大小都跟着重算）
- **页码跳转**：toolbar 里 number input + Enter 平滑 scroll
- **键盘快捷键**：`+`/`=` 放大、`-`/`_` 缩小、`0` fit-width、`g` 聚焦页码输入框。在 input/textarea/contenteditable 里 typing 时不拦截；按住 Cmd/Ctrl/Alt 时也不拦截（让 browser 自己的快捷键过）
- **Reserved-space lazy mount**：每页用 `IntersectionObserver`（`rootMargin: '800px 0px'`）按需 mount；未 mount 时 wrapper 用 letter aspect ratio (8.5:11) 预留高度 → 布局不塌、滚动平稳
- **`useDeferredValue`**：rapid +/− click 合并成一次 re-render，不会触发 N 次画布重建
- 三件事一起 → load + zoom **不再 white-flash**（这个问题在 2026-04-26 报告并修掉）

---

## Phase 13 — /library 页面

登录后用户看书列表。**v2 改动**：链接指向 `/b/[id]`（Book Home），不是老的 `/b/[id]/map`。

### 13.1 拆 server / client

`/library/page.tsx` 是 server component，负责 auth + 防御性 claim + 数据查询，把书列表 props 给 client 的 `LibraryList`。

```tsx
// app/library/page.tsx
export default async function LibraryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/library')

  // 防御性 claim：万一 Email 登录路径漏了，这里再尝试一次
  const sessionId = await getSessionId()
  if (sessionId) {
    try { await claimSessionBooks({ userId: user.id, sessionId }) } catch {}
  }

  const db = createAdminClient()
  const { data: books } = await db.from('books')
    .select('id, title, author, page_count, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  return books?.length
    ? <LibraryList books={books} />
    : <EmptyState />   // 内联在 page 里的简单 empty state
}
```

### 13.2 LibraryList 客户端列表（删书）

`components/LibraryList.tsx` 是 client。每张卡片右上角有 3-dot menu (`MoreVertical`)：

- 点 `⋮` → 弹出 dropdown，唯一选项 "Delete book"（红色，destructive token）
- 点 Delete → `window.confirm("Delete \"《书名》\"? Questions, briefs, and the PDF will be removed.")`
- 确认 → `fetch('/api/books/[id]', { method: 'DELETE' })` → 乐观从列表移除
- ESC 关菜单；点外面（fixed inset overlay）也关
- 删除中卡片 50% 透明，菜单按钮 disabled

### 13.3 DELETE /api/books/[id]

```typescript
// app/api/books/[id]/route.ts
export async function DELETE(_request, { params }) {
  const { id } = await params
  // 验 auth → 验 owner_id 匹配
  // best-effort 删 Storage blob（vr-docs/...）
  // 删 books 行 → cascade 自动清掉 chapters / questions /
  //              question_chapters / briefs / restatements
  return NextResponse.json({ ok: true })
}
```

Cascade 是 v1 → v2 schema 在 ON DELETE CASCADE 已经布好的（Phase 4A Path B 里），所以这里只删一行 books 就完事。

不做：搜索、标签、筛选、统计、分享。

---

## Phase 14 — Session PDF 24h 清理 Cron

**v2 不变**：session book 机制仍在（upload 之前 / claim 之前的 book）。

### 14.1 `vercel.json`

```json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 1 * * *" }]
}
```

### 14.2 Cleanup Route

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

# OpenAI (Phase 6, 8, 10, 12)
OPENAI_API_KEY=

# App (Phase 2)
NEXT_PUBLIC_APP_URL=

# Cron (Phase 14)
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
□ Phase 2: 首次 Vercel 部署（Paste .env + 实测 landing renders）
□ Phase 3: v0 polish + token lockin + dark mode toggle
□ Supabase Redirect URLs 加生产 URL（Phase 2 末尾或 4B 时）
□ Dashboard → Data API → Exposed schemas 加 `vr` → Save
□ Storage bucket `vr-docs`：Phase 6 创建时用
□ Phase 4A: SQL 在 vr schema 建表 + RLS + policies
□ npm run db:types 生成类型
□ Phase 4B: Auth（middleware 保护整个 /b/*）
□ Phase 5: (skipped — open source MVP, no Stripe; 未来如收费走 §12.D)
□ Phase 6: Upload API + lib/pdf/outline.ts + lib/pdf/parser.ts + lib/ai/intake.ts
□ Phase 7: Book Home（/b/[id] page + BookHomeScreen + /api/question）
□ Phase 8: Question Result + QuestionResultScreen + ChapterListPane + lib/ai/relevance.ts
□ Phase 9: LoginModal + /api/claim + callback 内联 claim
□ Phase 10: BriefPane + /api/brief + lib/ai/briefer.ts
□ Phase 12: ReadPane + PdfViewer + /api/ask + lib/ai/asker.ts
□ 端到端实测：Upload → Login → Book Home → Ask → Result → Brief / Read
□ Phase 13: /library
□ Phase 14: cron cleanup + vercel.json
□ new-project.sh 已处理：sprint-report.yml + notify-playbook.yml
□ GitHub Secrets 加 PLAYBOOK_TOKEN

—— Build 阶段以上结束。下面是 Post-MVP（按 STANDARD §12 顺序）——

□ §12.A UAT（创始人 dogfood）：自己读完 1 本真书；不通过 → 回 Phase 6-N 改业务
■ §12.B Custom Domain：✅ 完成 2026-05-02 —— `vibe-reading.dev`（apex 主 / www 307）
□ §12.C Scale-up：开放陌生人前剩 Sentry + Posthog（rate limit / storage cap / OpenAI cost ceiling 已于 2026-04-30 完成）
□ §12.D Stripe：仅当决定收费时；走 STANDARD §6 Stripe 模块
```

> **Phase 11 (Restate) 跳过** —— Reserved for v1.1。代码 / 表保留，UI 不挂。

---

## 成功判定

参照 `docs/vibe-reading.md` §Success Criteria + STANDARD §12.A UAT 决策 gate：

**Week 1（§12.A 创始人 dogfood）**：作者自测 —— 用 MVP 读完 1 本自己真想读的书。比 ChatPDF / NotebookLM 差 → 不进 §12.B 域名，回 Phase 6-N 改业务。

**Week 2-4（§12.A 通过 + §12.B/C 完成后才启动）**：5-10 个朋友试用 —— 看他们在 Book Home 输入框写得出问题吗？用的是自己的问题还是 AI 推荐的？点 [Brief] 后会进 [Read] 吗？大部分人卡住 → 方法论太理想化，重新设计。

> **关键**：朋友试用**不在** §12.A（§12.A 是 solo dogfood）；它发生在 §12.A 通过 + §12.B 域名定型 + §12.C 硬化全做完之后。在 dogfood 没通过就邀请朋友 = 浪费朋友的耐心。

---

## Human Work Budget

按 STANDARD §11 的 phase 顺序。

| STD Phase | 🙋 Step | Time | 备注 |
|---|---|---|---|
| 0 | GitHub repo → Secrets 加 `PLAYBOOK_TOKEN` | 30s | |
| 0→1 | 从 launchradar 拷 Supabase / OpenAI / CRON_SECRET 到 .env.local | 1 min | |
| 1 | Phase 1 全 🤖 | — | |
| **2** | Vercel Dashboard → Import repo → Paste .env → Deploy | 3 min | landing 可见就部 |
| 2 | 线上 URL 实测 landing 渲染 | 1 min | |
| **3** | v0.dev 出 brief + 拿 .tsx 给 AI | 5 min | 复制 brief 模版即可 |
| 3 | 浏览器实测 light + dark prod URL | 2 min | |
| 4 | Supabase SQL Editor 跑 vr schema SQL | 2 min | 🤖 产出 SQL |
| 4 | Data API → Exposed schemas 加 `vr` → Save | 1 min | |
| 4 | `npx supabase login` | 2 min | |
| 4 | Google Cloud Console → OAuth Client + redirect URI | 3 min | |
| 4 | Supabase Auth → Google toggle ON + 粘 Client ID/Secret | 2 min | |
| 4 | 浏览器测 Email / Google / middleware redirect | 5 min | |
| 5 | — | 0 | 本项目无付费 |
| 6-N | 每 Phase push → Vercel 自动 redeploy → 浏览器走 user flow | ~3 min × phase | 业务 phase 约 7 个（Phase 6-14，去掉 Phase 11 Reserved） |
| 上线后 | Google OAuth + Supabase Redirect URL 加生产 URL | 3 min | 首次 prod deploy 后 |

### Total 估算

- **Setup (Phase 0-4)**：~30 min（含 v0 polish 7 min）
- **Per business phase**：~3 min
- **全 MVP (7 业务 phase)**：~30 min setup + ~21 min phase testing = **~50 min 总人工时间**
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
