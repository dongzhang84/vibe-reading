# Vibe Reading - Product Proposal

## One-liner

A reading tool that refuses to summarize the book before you tell it why you're reading it.

一个拒绝替你总结全书的读书工具——除非你先告诉它你为什么要读。

---

## Philosophy

> The bottleneck of learning is not information transfer, but information compression. AI cannot do the compression for you — compression must happen in your brain, using your existing cognition as hooks.

Vibe Reading 是一个**反主流**的读书工具。它故意阻止用户做三件现在最流行的事：

1. 一上传就出全书摘要
2. 不加筛选地把所有章节讲一遍
3. 读完就走，不做复述

设计上每一屏都在告诉用户："你要出力。"AI 只做映射和挑错，不做理解。

## What it's NOT

- ❌ ChatPDF 的克隆（不是上传 PDF → 一键问答）
- ❌ NotebookLM 的克隆（不是知识库 + 检索）
- ❌ AI summary 工具（明确反对一键总结）

## What it IS

- ✅ 一个把"读书过程"工程化的工具
- ✅ 一个强制用户先做需求承诺、再获取内容的工作流
- ✅ 一个用 AI 校对你的理解、而不是替你理解的"挑错者"

---

## Problem

知识工作者的读书困境：

- **时间不够读全书** — 每周桌上堆着 3-5 本 300 页的书，没法都读完
- **AI 摘要骗人** — 一键摘要听起来对，但读完等于没读，转头就忘
- **不知道哪章该精读** — 全书 10 章，你其实只需要 3 章的内容
- **读了不一定懂** — 懂和"以为自己懂"之间隔一层，现在没有工具能戳穿
- **被动接受信息** — AI 喂什么就吃什么，失去了主动筛选和压缩的能力

**现有工具的问题**：
- ChatPDF / NotebookLM：解决"问答"而非"读书"，鼓励偷懒
- AI summary 类：把理解外包给模型，用户大脑 0 参与
- 传统电子书阅读器：没有 AI 介入，效率低

## Solution

一个 4 屏的工作流（Book Home 顶部嵌一段静态 Orientation 提示）：

1. **Upload** — 上传 PDF，**立刻要求登录**（确保每本书归属用户、可收藏、可问多次）。系统后台解析 PDF outline 提取 TOC，用 AI 基于 intro + conclusion 写本书 overview，再据此生成 3 个适合这本书的推荐问题
2. **Book Home** — 进入这本书的主页：
   - 顶部 **Orient yourself · before you ask**：4 个静态问题展示给读者（**纯认知提示，没有输入框、不存 DB、不喂 AI**）：
     1. What is this book about?
     2. Who wrote it, and what's their background?
     3. Who is it written for?
     4. What do you want to take away from it?
   - 读者读完、**自己心里过一遍**，然后到下方的 Ask 区提问
   - 然后展示 TOC + 问题输入框 + 3 AI 推荐问题（一键提交）+ 历史问过的问题列表（可重新打开任一）
3. **Question Result** — 提交问题后，左侧列出与该问题相关的章节 + 简短理由（AI 生成）；每章有 [Brief] / [Read] 两个按钮。点击后**右侧分屏**显示对应内容：Brief 是 4 段式结构化摘要，Read 是 PDF 跳到该章。"← Back to book" 回 Book Home，可以问下一个问题
4. **(预留) AI 互动复述** — 老 Restate 流程暂时隐藏入口，未来作为「和 AI 互动加速阅读」feature 重做

**为什么是 4 屏不是 5 屏**：老设计假设用户能用 1 句话表达整本书的学习目标（goal）。实际使用中，用户的真实意图是**多个零散问题**（"这本书在讲什么"、"为什么重要"、"它跟 X 的对比是什么"、"第 6 章的论点具体是"）。一本书一个 goal 太粗；一本书 N 个问题更接近真实阅读场景。"goal" 退位为 "question"，一本书可以问多次，历史保留可回看。

**为什么 Orientation 是静态展示而不是表单**：考过的对照是"4 个 textarea + DB 列 + Ask 区 gate"那种重型版本。结论是"AI 不替用户压缩"不等于"用户必须打字"——4 个问题本身就是钩子，**被问到的那一刻**已经触发读者大脑里的 orient 动作。捕获答案 → 数据库 → AI context 这条链路是过度工程：增加一次提交 friction，对下游问答精度的提升可忽略。把 ritual 留在认知层，比落地到 textarea 更贴近"compression must happen in your brain"的本意。

---

## Target Users

**Primary:**
- Researcher / PhD — 每周要快速扫多篇论文或专著的节选
- 产品经理 / 咨询顾问 — 为会议准备，需要定点提取特定章节
- 工程师 — 读技术专著，验证某方法论是否存在、作者立场

**反目标用户（明确排除）:**
- 想"一键摘要省时间"的人 — 产品会让他们不爽
- 文学爱好者 — 小说不适合这套方法论
- 完全 0 基础的小白 — 方法论需要用户已有一些钩子

---

## The 4 Design Rules (铁律)

开发过程中任何 PM / 程序员都要遵守：

**Rule 1** — AI 不能在用户表达需求之前输出任何**关于章节内容**的东西。上传 PDF 后可以展示 TOC、可以生成 book overview 和推荐问题（这些是书的元信息，不是内容压缩），但**必须先有用户提交的问题**才能触发任何章节级的映射或 brief。

> **Orientation 是 Rule 1 的纯粹形态**：Book Home 顶部 4 个问题（主题 / 作者 / 目标读者 / take-away）**纯静态展示**，没有 textarea，AI 一句话不写。即便是元信息层面的"这本书是什么"也不替读者压缩 —— 让读者自己翻前言、看封底、调动已有钩子。被问到的那一刻就是 ritual 本身：读者读完、心里过一遍，再去下方 Ask 区提问。这一步把"compression must happen in your brain"从 spec 立场推到 UI 上的认知锚点。

**Rule 2** — 相关章节匹配屏只做映射，不做内容。"Chapter 3 likely contains X" 可以，但不能在这屏开始总结 Chapter 3 本身。

**Rule 3** — Brief 模式的输出必须强制结构化：1 句话 + 3 claims + 1 例子 + 作者没说什么。不允许散文。

**Rule 4 (Deferred to v1.1)** — 老版本要求 Brief 后强制接复述屏，不允许跳过。产品转向问题驱动后，"复述章节"作为强制 gate 不再契合（用户问了一个问题期待的是答案 + 章节，不是又一个写作任务）。复述的代码 / 表 / API **全部保留**，作为未来「AI 互动加速阅读」feature 重做时复用的基础。当前 v1：Restate 入口在 UI 上不可见。

---

## Differentiation

| vs | Diff |
|----|------|
| ChatPDF | 他们一键问答鼓励偷懒；我们先强制定义 goal 才让用户触碰内容 |
| NotebookLM | 他们是知识库检索；我们是读书流程编排，强调压缩而非查询 |
| AI summary 工具 | 他们把理解外包给模型；我们让 AI 做挑错者，压缩留给用户大脑 |
| 传统电子书 + Claude/ChatGPT | 他们依赖用户自律；我们把费曼式方法论做进产品的强制步骤 |

**核心护城河**：哲学本身。产品拒绝做用户想要的"偷懒",这是反主流的定位。别的 AI 读书工具都在抢"更快更省事"，Vibe Reading 抢"读完真的记得住"。

---

## MVP Boundaries

**第一版只做：**
- ✅ PDF 上传 + 解析目录（中英文双语）
- ✅ 4 屏核心工作流（v2 question-driven）
- ✅ Google + Email/Password 登录
- ✅ /library 页面（含删书 affordance）
- ✅ 英文 UI（只有一种语言）
- ✅ 桌面 web
- ✅ Light / Dark 主题切换

**第一版不做（防止 scope creep）：**
- ❌ 登录前 PDF 永久存储（session 24h 清理）
- ❌ 多书对比 / 知识库
- ❌ 中文 UI
- ❌ 移动端
- ❌ 收费功能（MVP 全免费）
- ❌ 分享 / 社交
- ❌ 导出笔记
- ❌ EPUB / Mobi / 网页文章（只 PDF）

---

## Login Strategy

上传 PDF 后**立刻要求登录**，登录完成后才能进入 Book Home（看 TOC、问问题）。登录提示文案透明告知：「Your book is ready. Sign in so we can remember it for you — ask as many questions as you want.」

**为什么登录提前了**：
- 老版本 Screen 1-3 不要求登录，是怕用户在看到产品价值前流失。价值兑现点定在"三色映射出现"——所以登录放在 Map → Brief 的转场
- 新版本价值兑现点**提前到 Book Home**（用户上传完立刻看到 TOC + AI 推荐问题，已经能感受到产品在做什么），所以登录可以前置
- 同时简化了 pre-login session-book / claim 机制（代码保留，用户感知不到）

支持 Google + Email/Password。**Sign in / Sign up 是同一入口**（modal 文案必须明示 "same modal"；参考 `stack/STANDARD.md` §3.2 的 UX 铁律）。不做 GitHub / 手机 / 微信。

---

## Pricing (预留，MVP 不上线)

- MVP 全免费
- 未来付费墙可能放在：每月 3 本免费，之后 $X/月
- **前 100 个用户永久免费**（founding users 承诺，要兑现）

---

## Success Criteria

**Week 1: 创始人自测**
- 用这个 MVP 读完 1 本自己真想读的书
- 标准：比 ChatPDF / NotebookLM 好用。如果自己都觉得"还是 NotebookLM 好用" → MVP 失败，回去改

**Week 2-4: 5-10 个朋友试用**
- 他们在 Book Home 输入框真的写得出问题吗？还是只点 AI 推荐？
- 他们点 [Brief] 之后真的会去看 [Read] 原文吗？还是把 4 段式摘要当答案就走？
- 还是一上传就盯着 dropzone 等"一键摘要"？

**判断标准：** 如果大部分人卡在"想不出问题"、或者把 Brief 当终点不进 Read → 方法论太理想化，重新设计；尤其得反思"问题驱动"是否给非研究者的读者带来过高门槛。

---

## Founder-Market Fit

### ✅ Why Me?

- **我就是目标用户** — 每周读 2-3 本技术/商业专著，一直嫌 ChatPDF 偷懒
- **费曼学习法是我 strategy-2026 的核心** — Vibe Reading 是把这个方法论工程化
- **反主流定位我能坚持** — 别的 AI 工具都在加速偷懒，我愿意为"反偷懒"站台
- **Week 1 就能自测** — 产品小、快、我就是第一个用户，验证周期 7 天而不是 30 天

### ⚠️ 风险

- **教育市场慢** — 用户习惯被 AI summary 宠坏，教育"为什么要自己复述"需要时间
- **可能小众** — 愿意为"不偷懒"付费的人是不是够多，不确定
- **竞品可能抄哲学** — 如果 NotebookLM 加个"goal-first"模式，护城河就没了

### Mitigation

- 内容先行 — 把"Vibe Reading 方法论"本身做成小红书 / B 站系列，产品跟着内容走
- 不和通用 AI 工具正面对抗 — 垂直做"严肃读者的读书工具"，不抢 ChatPDF 的懒人用户
- 哲学深度 > 功能广度 — 4 条铁律不妥协，保持品牌纯度

---

## Status

**✅ MVP shipped** — 2026-04-27

v2（4 屏 question-driven）端到端跑通：上传 → 登录 → Book Home → 提问 → Question Result（左 chapter list + 右 Brief / Read 分屏）。已用真书自测过（《程序员修炼之道》第 2 版、Kuhn《科学革命的结构》等）。

UI 已过 v0 redesign + Notion-warm token 系统 + light/dark toggle + PDF 缩放 + 键盘快捷键 + 删书 affordance。Live 在 [vibe-reading-iota.vercel.app](https://vibe-reading-iota.vercel.app/)。

**演进史**：
- 2026-04-21 v1 spec（5 屏 goal-driven）写完
- 2026-04-23 v1 实现 + 上线，发现真书测试翻车（goal 模型对评价性问题无路径回答；章节切分喂给下游 AI 变乱码）
- 2026-04-24 redesign 为 v2（4 屏 question-driven），TOC + 推荐问题 + 历史 question 为核心 UX
- 2026-04-25 ~ 04-27 v2 完整 MVP 上线 + UI overhaul + production polish
- 2026-04-29 v2.1 Book Home 顶部加 **Orientation ritual**（最初版：4 个 textarea + take-away unlock + 注入 relevance AI）
- 2026-04-30 Orientation 简化为**静态展示**：去掉 textarea / DB 列 / Ask 区 gate / relevance 注入。结论："AI 不替用户压缩"不等于"用户必须打字"——4 个问题本身就是钩子，被问到那一刻就触发了 orient。同日修三个真实使用 bug：(a) PDF 没 Title metadata 时回退到文件名，避免书名变 "Untitled"；(b) Part-Chapter 结构的书（如 _Beyond Vibe Coding_）原本只按 level-1 切，导致 Part I/II/III 被当成单一章节喂给 relevance AI，加 chapter-level picker + front-matter 过滤后修复；(c) 30MB 书在 Vercel Hobby 上传失败（`FUNCTION_PAYLOAD_TOO_LARGE` ~4.5MB 限制），upload 改成 3 阶段直传：客户端拿 signed URL 直接 PUT 到 Supabase Storage（绕过 Vercel function），server 端 finalize 从 Storage 拉文件后再解析 + AI。Question Result 页 "← Back to book" 升级为 "Ask another question →" CTA。
- 2026-04-30 (晚) 三处 UX/i18n 收尾：(a) Upload **analyzing 阶段**加 elapsed-seconds counter + 跟服务端 pipeline 顺序对齐的轮换文案（"Reading the book outline → Mapping chapter boundaries → Drafting your starter questions"），消除 10–25 秒等待期的信息真空；(b) **AI 输出语言跟源语言走** —— 中文书 → 中文 brief / 中文推荐问题 / 中文 overview；relevance 的 reason 跟用户**提问语言**走（中文问 → 中文 reason，给了"可能包含 / 讨论了 / 涉及 / 介绍了"作为 few-shot）；(c) Question Result 左 pane 顶部加小的 "← Library" 灰色链接，给"换本书"一条快路（不动 Nav 隐藏规则，不影响 PDF 区域高度）。

**下一步**：rate-limit / Sentry / OpenAI cost ceiling 等生产硬化（详见 `docs/todo.md` bucket B），然后才放给 5-10 个朋友实测。

---

## Sprint Summary

_This section will be auto-updated by the sync-from-projects workflow once the repo is created._
