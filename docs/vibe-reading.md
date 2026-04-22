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

一个 5 屏的强制工作流：

1. **Upload** — 上传 PDF，系统解析目录
2. **Define Goal** — 用户必须先用 1–3 句话说明"为什么要读这本书"（不能跳过、不能让 AI 代写）
3. **Three-Color Map** — AI 基于用户的 goal 把章节分成三色：值得读的 ✅、跳过的 ❌、这本书没回答的 ⚠️
4. **Read or Brief** — 用户选一章进入精读模式（AI 静默，只在召唤时出现）或转述模式（AI 用严格 4 段式输出：1 句话 + 3 claims + 1 例子 + 作者没说什么）
5. **Compress & Check** — 用户必须用自己的话复述章节核心，AI 挑错（哪里对、哪里漏、哪里理解偏了）

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

**Rule 1** — AI 不能在用户表达需求之前输出任何关于书的内容。上传 PDF 后不能立刻"AI 已为您总结"，必须先经过 Goal 输入。

**Rule 2** — 三色匹配屏只做映射，不做内容。"Chapter 3 likely contains X" 可以，但不能在这屏开始总结 Chapter 3 本身。

**Rule 3** — 转述模式的输出必须强制结构化：1 句话 + 3 claims + 1 例子 + 作者没说什么。不允许散文。

**Rule 4** — 转述之后必须强制接挑错屏，不允许用户直接退出。读了 brief 不复述就走 = 等于没读。

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
- ✅ 5 屏核心工作流
- ✅ Google 登录 + magic link
- ✅ /library 页面（最简版）
- ✅ 英文 UI（只有一种语言）
- ✅ 桌面 web

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

- Screen 1–3（上传 → 定 goal → 看三色映射）**不需要登录**
- 点击"Read Chapter X" 或 "Brief me" 时触发登录 modal
- 登录理由透明告知：「You've seen how this book maps to your goal. To go deeper, we need to know who you are.」
- 只支持 Google + magic link，不做密码 / 手机 / 微信

**原则：** 登录不是惩罚，是进入价值核心的钥匙。Screen 1-3 不摆 Sign in 按钮，避免用户焦虑"登录是否能解锁什么"。

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
- 他们在 Goal 输入屏写得出需求吗？
- 他们在复述屏真的会打字吗？
- 还是一进来就想跳过去"一键摘要"？

**判断标准：** 如果大部分人卡在 Goal 输入或跳过复述 → 方法论太理想化，重新设计。

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

**💡 Proposal** — 2026-04-21

产品规格已定稿，尚未动工。下一步：

1. 定产品名 + 域名（候选：`viberead.com` / `vibereading.com` / `vibereading.ai`）
2. 搭脚手架（Next.js + Supabase + pdf-parse + Claude API）
3. Week 1 自测目标：用它读完一本真想读的书

---

## Sprint Summary

_This section will be auto-updated by the sync-from-projects workflow once the repo is created._
