[English](./README.md) · **中文**

# Vibe Reading

**一个拒绝替你总结全书的读书工具——除非你先告诉它你为什么要读。**

> A reading tool that refuses to summarize the book before you tell it why you're reading it.

🔗 **在线试用**: [vibe-reading-iota.vercel.app](https://vibe-reading-iota.vercel.app/)

---

## 这工具想干什么

市面上大多数 AI 读书工具，本质上都是"伪装的摘要工具"——上传一本书，点一下按钮，吐出一份你明天就会忘的概述。学习的瓶颈不是把信息塞进脑子，而是脑子里发生的那次**压缩**。AI 替你做不了这件事。

所以 Vibe Reading **拒绝在你提出问题之前做任何摘要**。问题就是索引。你问出来之后，AI 才把你的问题映射到能回答它的章节，给你一份 4 段式结构化笔记（核心主张 · 3 条要点 · 1 个例子 · 作者**没**讲什么），让你和原书 PDF 并排看。读这一步交还给你。

> "学习的瓶颈不是信息传递，而是信息压缩。AI 不能替你压缩——压缩必须发生在你自己的脑子里，用你已有的认知做钩子。"

![Vibe Reading 产品流程](./diagram/product-flow/diagram.svg)

---

## 跟其他工具有什么不一样

| vs | 我们做了什么不同 |
|---|---|
| **ChatPDF** | 拒绝一键总结；问题必须先于内容。AI 只做"章节映射员"，不替你换种说法复述章节。 |
| **NotebookLM** | 不是给你做检索的知识库，是给你跑读书工作流的工具，强调压缩而非查询。 |
| **AI 摘要类工具** | 不替你压缩。压缩才是真的活，AI 只做映射 + 挑刺，不替代。 |
| **普通 PDF 阅读器 + ChatGPT** | 把"先问 → 看完后比对自己的理解"这个费曼式循环烙进产品本身。 |

完整的产品哲学和设计铁律见 [`docs/vibe-reading.md`](./docs/vibe-reading.md)。

---

## 它是怎么工作的

整套 4 屏流程，从头到尾：

1. **Upload（上传）** —— 拖一个 PDF。登录。书绑到你的账户。
2. **Book Home（书的主页）** —— 先 **Orient yourself**：自答 4 个问题（主题 · 作者背景 · 目标读者 · 你想 take away 什么）。**这一步 AI 不替你写一个字** —— 答案来自你自己的脑子、书的前言、封底。take-away 答完才解锁下方 Ask 区：TOC、overview、3 个 AI 推荐起手问题、自由输入框。take-away 之后会 pinned 在顶部，并作为 context 注入下游 relevance AI 提升匹配精度。
3. **Question Result（问题结果页）** —— 左侧：AI 觉得最可能回答你问题的章节，每条带一句话理由（"likely contains…"、"discusses…"）。右侧分屏，点击章节卡上的按钮：**Brief**（4 段式结构化笔记）或者 **Read**（PDF 跳到那一章，支持划词提问）。
4. **(预留 v1.1)** —— 互动复述 / 费曼检验。代码 / schema / API 全部保留，UI 入口在 v1 不可见。

底层只有 `pdfjs` 抽结构 + 4 个窄范围的 `gpt-4o-mini` 调用（intake · relevance · briefer · asker），全部用 JSON schema strict 模式。**没有 vector DB、没有 embeddings、没有 RAG 框架**。一本 23 章的书每个问题大概 1 美分。

技术 pipeline 图：[`diagram/tech-pipeline/diagram.svg`](./diagram/tech-pipeline/diagram.svg)。

---

## 技术栈

- **Next.js 16** App Router + Turbopack + **TypeScript** strict
- **Tailwind CSS v4** + shadcn/ui（克制使用 —— 大多数组件手写）
- **Supabase**（Auth + Postgres + Storage）—— Supabase only，不上 Prisma / Drizzle
- **OpenAI** `gpt-4o-mini` 跑所有 AI 调用
- [`unpdf`](https://github.com/unjs/unpdf)（serverless pdfjs fork）做 PDF 解析 + outline 抽取
- [`react-pdf`](https://github.com/wojtekmaj/react-pdf) 做浏览器内 PDF 渲染
- 部署在 **Vercel**
- **不用 Stripe、不用 analytics、不用 toast 库、不用动画库、不用 Figma**。Indie + 极简，刻意为之。

---

## 本地运行

这是个 indie 项目，但代码是正经 Next.js app，fork 起来不复杂。

```bash
git clone https://github.com/dongzhang84/vibe-reading.git
cd vibe-reading
npm install
cp .env.local.example .env.local   # 如果存在；不存在按下面的表自己建
```

你需要一个 Supabase 项目（free tier 就够）和一个 OpenAI API key。`.env.local` 内容：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=                    # 本地随便填一串
```

然后建 schema。Supabase Dashboard → SQL Editor，粘 [`docs/vibe-reading-implementation.md`](./docs/vibe-reading-implementation.md#phase-2--数据库-schema-v2) 里的 **Path A**（"fresh install" SQL 整段）。会建出 `vr` schema、所有表、RLS policies、index。然后到 **Settings → API → Exposed Schemas** 把 `vr` 加进去。

```bash
npm run db:types    # 重新生成 types/db.ts（可选但推荐）
npm run dev
```

打开 `http://localhost:3000`，扔一个 PDF。

> **配 Auth providers**（Google OAuth）的细节在 `docs/vibe-reading-implementation.md` Phase 3。Email/password 在 Supabase Auth 启用后开箱即用。

---

## 项目结构

| 路径 | 里面有什么 |
|---|---|
| `app/` | Next.js App Router —— pages、API routes、layouts |
| `components/` | 所有 UI（Nav、ChapterListPane、BriefPane、ReadPane、PdfViewer …） |
| `lib/ai/` | 4 个 LLM 调用点 —— `intake`、`relevance`、`briefer`、`asker` |
| `lib/pdf/` | `outline.ts`（pdfjs.getOutline）+ `parser.ts`（基于正则的 fallback 切分） |
| `lib/supabase/` | client / server / admin 三个 Supabase client，都绑定 `vr` schema |
| `docs/` | 产品 spec、实现指南、UI 设计报告、todo |
| `diagram/` | 手写 SVG 图（产品流程 + 技术 pipeline） |
| `scripts/` | 本地 debug 用的探针（`probe-schema-v2.mjs`、`smoke-m1.mjs`、`diag-relevance.mjs`） |

详细文档：

- [产品 Spec](./docs/vibe-reading.md) —— 哲学、目标用户、4 条设计铁律
- [实现指南](./docs/vibe-reading-implementation.md) —— phase 一步步过：prompts、schema、env vars
- [UI 设计报告](./docs/ui-design-report.md) —— design tokens、组件分层、视觉规则
- [TODO](./docs/todo.md) —— 已发了什么、下一步做什么

---

## 状态

✅ **MVP 已上线** —— 2026-04-27。完整的 question-driven 流程跑通：上传 → 问问题 → 看到匹配章节 → Brief/Read 分屏。包括 PDF 缩放 + dark mode + 删书 + 0-match 重试。已用真书自测过。

🚧 **下一步**：在放给朋友之前的生产硬化（rate limit · 错误监控 · 成本上限）。详见 [todo.md](./docs/todo.md) bucket B。

🔮 **预留 v1.1**：交互式复述 / 费曼检验。代码 / 表 / API 全部保留（`vr.restatements` + `lib/ai/checker.ts` + `components/RestateScreen.tsx`），UI 入口暂不挂。

---

## 参与贡献

这是单作者 indie 项目，但欢迎 PR 和 issue：

- **Bug 报告**带可复现步骤的最受欢迎
- **Feature 想法**符合 spec "拒绝替你总结" 立场的有意思；想把它改成另一个 summarizer 的不在范围内
- **UI 抛光 PR** 非常欢迎 —— `docs/ui-design-report.md` § 8 列了一份已知视觉缺口
- 较大改动请先开 issue 对齐方向

项目的设计铁律（[`docs/vibe-reading.md` §The 4 Design Rules](./docs/vibe-reading.md)）刻意限制严格。Rule 1（"用户提出需求之前，AI 不能就章节内容说话"）是这个项目存在的理由 —— 请别尝试削弱它。

---

## 致谢

站在以下肩膀上：

- [Next.js](https://nextjs.org/) + [Vercel](https://vercel.com/) —— 框架 + 部署
- [Supabase](https://supabase.com/) —— Auth + Postgres + Storage 三合一
- [OpenAI](https://openai.com/) —— `gpt-4o-mini` 干所有 AI 活
- [unpdf](https://github.com/unjs/unpdf) —— 唯一在 Next.js Turbopack 下能跑通的 PDF parser
- [react-pdf](https://github.com/wojtekmaj/react-pdf) —— 浏览器内 PDF 渲染
- [shadcn/ui](https://ui.shadcn.com/) + [lucide-react](https://lucide.dev/) —— 组件原语 + 图标
- [Geist 字体](https://vercel.com/font) —— 排版

---

## 许可证

MIT（待补 [`LICENSE`](./LICENSE) 文件 —— 目前 TBD，按 MIT 精神看待即可）。
