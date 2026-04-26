# Vibe Reading — UI Design Report

> 一份"代码层 UI 怎么搭起来的"事实性记录。覆盖框架、视觉系统、组件分层、设计取舍。
> 不是设计宣言，不是用户手册 —— 是给"想接手 / 改这套 UI 的开发者"读的速查。

---

## 1. 技术栈速览

| 层 | 选型 | 版本 |
|---|---|---|
| Framework | **Next.js 16** App Router + Turbopack | `16.2.4` |
| UI runtime | **React 19** | `19.2.4` |
| Language | **TypeScript** strict | `^5` |
| 样式系统 | **Tailwind CSS v4** + CSS variables | `^4` |
| 字体 | **Geist Sans + Geist Mono**（Vercel 自家） | via `next/font/google` |
| Component primitives | **shadcn/ui** (`base-nova` style, `neutral` base color) | `shadcn ^4.4.0` |
| Component primitives 底层 | **base-ui/react** (Radix 替代品，shadcn 新版用的) | `^1.4.1` |
| 工具 lib | `clsx` + `tailwind-merge` + `class-variance-authority` | — |
| Icon | **lucide-react** | `^1.8.0`（实际上**几乎没用** —— UI 里只有 `📖` 一个 emoji 和 `→ ←` 文字符号） |
| 动画 | `tw-animate-css` | `^1.4.0`（被 shadcn 拉进来，没主动用） |
| PDF 渲染 | **react-pdf** + self-host 的 `pdf.worker.min.mjs` | `^10.4.1` |

**没用的东西**（明确 cut）：
- ❌ Figma → code（没用 v0、Magic Patterns、Bolt 之类）
- ❌ CSS-in-JS（styled-components / emotion）
- ❌ framer-motion（无任何动画库）
- ❌ headless UI 之外的组件库（不上 MUI / Ant / Chakra / Mantine）
- ❌ 设计系统（不上 Radix Themes、Tremor、Park UI 等）

---

## 2. 设计系统（Design Tokens）

### 2.1 颜色

走 **Tailwind v4 CSS variable** 路线 —— 颜色全在 `app/globals.css` 里定义为 CSS var，亮暗模式靠 `prefers-color-scheme` 自动切换。组件里**永不**硬编码 hex，只用 token 名。

核心 token：

| Token | 用途 |
|---|---|
| `--background` / `--foreground` | 页面底色 / 主文字 |
| `--muted` / `--muted-foreground` | 次要区块底色 / 次要文字（章节 reason、caption） |
| `--border` | 所有 1px 描边 |
| `--primary` / `--primary-foreground` | 按钮主色（深色 pill） |
| `--destructive` | 错误文案 |
| `--card` / `--popover` 等 shadcn 标准 token | 备用，目前没主动用 |

所有 `.bg-*` `.text-*` `.border-*` 都是 token 引用。**单色调极简**，没有第二条 accent 色 ramp。

### 2.2 字体

```ts
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
```

挂在 `<html>` 的 className 里，CSS variable 形式。所有正文走 `--font-geist-sans`（默认），目前没用到 mono。

### 2.3 排版尺度

| Class | 用法 |
|---|---|
| `text-2xl font-medium` | 页面 H1（书名） |
| `text-lg font-medium` | 章节标题（pane header） |
| `text-base` | 默认正文 |
| `text-sm` | 次要正文（章节 reason、列表项） |
| `text-xs uppercase tracking-wider text-muted-foreground` | eyebrow / section label（"Brief"、"Read"、"PHASE A" 这类） |
| `text-xs text-muted-foreground` | caption / 辅助文字 |

**font-weight 只用三档**：`normal`（400，正文）/ `medium`（500，强调）/ `semibold`（600，page H1）。不用 `bold`。

**Sentence case** 永远 ✓（"Ask the book"，不是 "Ask The Book"）；只有 eyebrow 用 `uppercase`。

### 2.4 间距 / 圆角 / 边框

- **gap / padding** 只用 Tailwind 标准刻度：`gap-{2,3,4,6,8,10,12}`，`px-{3,4,6}`，`py-{1.5,2,3,4,12}`
- **圆角** 只用三档：
  - `rounded-md`（默认，按钮、卡片、输入框）
  - `rounded-lg` / `rounded-xl`（基本不用）
  - `rounded-full`（pill 按钮 —— 目前没用）
- **边框** 永远 1px，颜色 `border-border`。**不用 shadow**（除了 PDF 卡片有个轻 `shadow-sm`，让翻页时和背景区分）

---

## 3. 组件分层

### 3.1 文件组织

```
components/
├── ui/                  ← shadcn 标准目录（被 init 创建）
│   └── button.tsx       ← 唯一 install 的 shadcn 原子，目前也没主动用
├── Nav.tsx              ← 全站 sticky nav
├── UploadDropzone.tsx   ← Landing 上的 drag-drop 区
├── LoginModal.tsx       ← (Reserved) 登录 modal
├── BookHomeScreen.tsx   ← /b/[id] 的整页内容
├── QuestionResultScreen.tsx  ← /b/[id]/q/[qid] 的左右分屏壳
├── ChapterListPane.tsx  ← Question Result 左栏
├── BriefPane.tsx        ← Question Result 右栏 (Brief 模式)
├── ReadPane.tsx         ← Question Result 右栏 (Read 模式)
├── PdfViewer.tsx        ← react-pdf 封装
└── RestateScreen.tsx    ← (Reserved v1.1) 不挂路由
```

### 3.2 Server Component vs Client Component

约定：

- **Page (`app/**/page.tsx`)** 永远是 server component，负责：
  - 验证 auth (`createServerSupabaseClient().auth.getUser()`)
  - 数据查询（admin client，bypass RLS）
  - signed URL 生成（PDF）
  - 把 plain props 传给 client 组件
- **Screen 组件 (`*Screen.tsx` / `*Pane.tsx`)** 永远是 client，加 `'use client'`，负责：
  - 用户交互（点击、输入、selection）
  - 客户端 fetch（`/api/question` / `/api/brief` / `/api/ask`）
  - 本地 state（active chapter、loading、error）

**没有用 server actions** —— 所有 mutation 走传统 REST `/api/*` route handlers，便于测试。

### 3.3 没大量用 shadcn 的原因

`shadcn init` 跑了，但只装了 `button.tsx` 一个原子，且目前**没在产品代码里用**。所有按钮都是 `<button class="rounded-md bg-primary px-... ">` 这种纯 Tailwind 写法。

**为什么手写不抄 shadcn**：
1. MVP 期需要的组件都很简单（按钮、输入框、textarea、卡片、链接），shadcn 抽象的 `<Button variant="...">` 反而绕一圈
2. 想保持 "1 个 div + N 条 Tailwind class" 的可读性 —— 改样式不用跳到 button.tsx
3. shadcn 的 cva (class-variance-authority) 在我们这套**单一视觉语言**下没意义（不需要 outline / ghost / destructive 等多 variant）

未来如果要做表单、modal、tooltip、dropdown、command palette 这类复杂组件，再 `npx shadcn add` 拉。MVP 不预先抽象。

---

## 4. 布局模式

### 4.1 容器

| 页面 | 容器宽 | 备注 |
|---|---|---|
| `/`（landing） | `max-w-xl` (576px) | 单列窄面，强调 dropzone |
| `/library` | `max-w-2xl` (672px) | 书列表 |
| `/b/[bookId]`（Book Home） | `max-w-3xl` (768px) | TOC + 推荐问题 + 历史 |
| `/b/[bookId]/q/[qid]`（Question Result） | 全屏 `grid-cols-[2fr_3fr]` | 左右分屏，无外边距 |

所有非分屏页都用 `mx-auto flex-col gap-{N} px-6 py-{12,16}` 居中堆叠。

### 4.2 全站 Sticky Nav

`components/Nav.tsx` 挂在根 `app/layout.tsx`：

```
<header sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur>
  <div max-w-6xl mx-auto px-6 py-3 flex justify-between>
    [Vibe Reading]                     [Library | Sign out]
  </div>
</header>
```

- **登录态**：右侧 `Library | Sign out`
- **登出态**：右侧 `Sign in | Sign up`（Sign up 是实心 pill）+ 自动带 `?next=<current>`
- **自隐藏路径**：`/b/[id]/q/[qid]`（全屏分屏抢空间）+ `/auth/*`（auth 流自成一体）

Pathname 判断在 client，auth 状态从 root layout server-fetch 一次往下传 prop —— **首屏不闪烁**。

### 4.3 分屏（Question Result）

```
┌────────────────────┬──────────────────────────────┐
│ ChapterListPane    │ BriefPane / ReadPane         │
│ (2fr)              │ (3fr)                        │
│ scrollable         │ scrollable + sticky header   │
└────────────────────┴──────────────────────────────┘
```

`grid-cols-[2fr_3fr]` 比例，左右各自 `overflow-y-auto`。右栏内容由 `useState<ActivePane>` 决定，挂 `key={chapterId}` 触发 unmount/remount —— 切章节时自动重置 selection / ask history。

### 4.4 PDF 渲染

`components/PdfViewer.tsx`：
- `dynamic(() => import(...), { ssr: false })`（react-pdf 在 SSR 里炸 worker）
- `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` —— **self-host** 在 `public/`，不走 CDN（避免 Turbopack 跨域 worker 报错）
- 渲染**全部 page**（不分页 lazy load），用 `data-page-number` 锚点 + `scrollIntoView` 跳到 `initialPage`

够用，没做虚拟滚动 / 缩略图侧栏 / 页码跳转输入框等，MVP 不需要。

---

## 5. 视觉哲学的几条铁律

写代码时贯穿到底的几条潜规则：

1. **单色 + 单 accent**。整站只有一条颜色梯度（`background` → `foreground` 灰阶 + `primary` 一个深色 pill）。**不引第二种 accent ramp**（无蓝绿橙红多色 callout）。
2. **不装饰**。没 emoji（除了 1 个功能性 `📖` 表 book-level entry）、没 hero 图、没插图、没 illustration、没 logo（只有 metadata 里的小 `V` favicon SVG）。
3. **行高 / 留白靠 Tailwind 默认**。没动 `leading-*` 系数，少数地方 `leading-relaxed`。
4. **错误 / loading 都是文字**。不用 spinner 动画、骨架屏、shimmer。Loading 一律 `<p class="text-sm text-muted-foreground">Reading the chapter…</p>`。
5. **按钮文案带方向箭头**。CTA 用 `→` 收尾（"Ask →"、"Sign in →"），二级用 `←` 开头（"← Back to book"）。这是产品立场的视觉延伸 ——"读书是一段有方向的旅程"。
6. **eyebrow + title + body 三档**。多个屏共享这个层级（Pane header、Section header）：
   ```
   <p class="text-xs uppercase tracking-wider text-muted-foreground">BRIEF</p>
   <h2 class="text-lg font-medium">第4章 务实的偏执</h2>
   <p class="text-sm leading-relaxed">…</p>
   ```

---

## 6. 设计来源 / 参考

UI 不是从 mockup 译过来的。**没有 Figma 文件，没有 design lead**。一切由 Claude (我，Opus 4.7) 直接根据 spec + 既有项目惯例写出来。具体参考：

| 来源 | 借了什么 |
|---|---|
| **`stack/STANDARD.md`** (indie-product-playbook) | Auth UX 铁律（"Sign in / Sign up same modal"、`?next=` 防开放重定向、callback 内联 claim） |
| **`launchradar` 姊妹项目** | Supabase + Tailwind 项目结构；登录页布局；环境变量分层 |
| **`growpilot` 姊妹项目** | Sticky nav 的视觉模式（`backdrop-blur` + `border-b` + 左品牌 / 右按钮组）。**只参考结构，没抄代码** —— GrowPilot 用圆角彩 pill，我们用方形深色 pill |
| **`snowboat-blog` 的 baoyu-diagram skill** | SVG 图（product flow、tech pipeline）的设计系统（CSS var 亮暗、左窄右宽容器、accent 用法）—— 跟产品 UI 是两回事，但视觉语言一脉相承 |
| **shadcn 的 base-nova style** | CSS variable 命名约定（`--background` / `--foreground` / `--muted` 等） |

---

## 7. 没做但 spec 留了口子的

| 功能 | 状态 |
|---|---|
| 移动端响应式 | spec 明说"桌面 web only"，所以**没做**。`grid-cols-[2fr_3fr]` 在 mobile 上会塌成 1 列（已用 `lg:` breakpoint 守了），但其他细节（侧栏、表单宽度）没专门 mobile-tuned |
| Dark mode toggle | CSS var 已经支持，但**没做手动开关** —— 跟 OS prefer-color-scheme 走 |
| Loading skeleton / shimmer | 故意不做（见 §5 第 4 条） |
| 动画 / transition | 故意不做（除按钮 hover 状态用 Tailwind 自带 `hover:` 渐变） |
| Toast / notification | 没用 toast 库；错误一律 inline 红字 |
| Modal / dialog | LoginModal 文件存在但 **v2 没在用**（登录改成 full page）；未来需要 modal 时 `npx shadcn add dialog` |
| 头像 / avatar / user dropdown | Nav 故意只显 "Sign out" 文字链接，没头像 |
| Form validation library | 不用 react-hook-form / zod —— 表单都是简单 controlled input + 手写 validation |

---

## 8. 给后续优化（人工 polish）的提示

UI 是用 **"功能正确 + 视觉极简"** 取舍写的，不是为审美设计。下一步人工优化时可以重点关注：

1. **landing hero 弱**。当前只有标题 + dropzone + 一段哲学 —— 可以加产品截图、动机阐述、社会证明
2. **Book Home 信息密度高但没层级**。TOC 长（你那本 23 条）、推荐问题、历史问题在同一垂直流里，刷起来累 —— 可以两栏布局或折叠 TOC
3. **Question Result 左栏 chapter 卡片样式**比较朴素 —— rank 没有视觉权重区分，"Brief / Read" 按钮无 hover 提示
4. **PDF viewer 体验**：没有页码跳转输入框、没有缩放、没有侧栏缩略图。最少应该加个 "P. N / Total" 显示
5. **/library 列表**：只有书名 / 作者 / 创建日期。加封面缩略图 / 上次问的问题 / 章节进度会更有用
6. **空状态 empty state** 都是简单文字。Library "No books yet" 那个 dashed border 很 OK，但 Book Home 没有推荐问题时（intake AI 失败）渲染会很尴尬
7. **错误状态**：当前所有错误都是 inline 红字小字，没图示、没引导动作。/api/upload 失败时只有 alert()，没 retry 按钮

---

## 9. 总结一句

> 这套 UI **不是设计驱动的**，是 spec + 视觉极简哲学**反向倒逼**写出来的。
> 框架是 Next.js 16 + Tailwind v4；组件是 shadcn 装了但几乎没用，全部手写；视觉是单色 + 单 accent + sentence case；动画为 0；emoji 为 0（功能性除外）。
> 优先级永远是 **"正确 > 一致 > 美观"** —— 美观留给后续人工 polish。
