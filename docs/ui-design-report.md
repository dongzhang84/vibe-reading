# Vibe Reading — UI Design Report

> 一份"代码层 UI 怎么搭起来的"事实性记录。覆盖框架、视觉系统、组件分层、设计取舍。
> 不是设计宣言，不是用户手册 —— 是给"想接手 / 改这套 UI 的开发者"读的速查。
>
> Last updated: 2026-04-27（post v0 landing redesign + Notion-warm token shift + dark mode + PDF viewer expansion）。

---

## 1. 技术栈速览

| 层 | 选型 | 版本 |
|---|---|---|
| Framework | **Next.js 16** App Router + Turbopack | `16.2.4` |
| UI runtime | **React 19** | `19.2.4` |
| Language | **TypeScript** strict | `^5` |
| 样式系统 | **Tailwind CSS v4** + CSS variables (oklch) | `^4` |
| 字体 | **Geist Sans + Geist Mono**（Vercel 自家） | via `next/font/google` |
| Component primitives | **shadcn/ui** (`base-nova` style, `neutral` base color) | `shadcn ^4.4.0` |
| Component primitives 底层 | **base-ui/react**（shadcn 新版用的 Radix 替代品） | `^1.4.1` |
| 工具 lib | `clsx` + `tailwind-merge` + `class-variance-authority` | — |
| Icon | **lucide-react** —— 全站常用：`BookOpen`、`Sparkles`、`Brain`、`MessageSquare`、`Upload`、`MoreVertical`、`Trash2`、`RefreshCw`、`Sun`/`Moon`、`Maximize2`、`Plus`/`Minus`、`ArrowLeft`/`ArrowRight` | `^1.8.0` |
| 动画 | `tw-animate-css` | `^1.4.0`（被 shadcn 拉进来，只给 RefreshCw spin 用） |
| PDF 渲染 | **react-pdf** + self-host 的 `pdf.worker.min.mjs` | `^10.4.1` |

**没用的东西**（明确 cut）：
- ❌ CSS-in-JS（styled-components / emotion）
- ❌ framer-motion（无任何动画库）
- ❌ headless UI 之外的组件库（不上 MUI / Ant / Chakra / Mantine）
- ❌ 设计系统（不上 Radix Themes、Tremor、Park UI 等）

**用过但只在 landing 阶段**：
- 🟡 **v0** —— 用 v0.dev 出过一版 landing redesign 当视觉参考（`ui_design/v0_landing_page/`，gitignored）。最终 token 是从 v0 那版 port 过来的；其它屏（Library / Book Home / Question Result）没过 v0，直接用相同 token 手写

---

## 2. 设计系统（Design Tokens）

### 2.1 颜色

走 **Tailwind v4 CSS variable** 路线 —— 颜色全在 `app/globals.css` 里定义为 CSS var，使用 **oklch** 色彩空间（不是 hex / hsl），亮暗模式靠 `<html class="dark">` 切换（不依赖 `prefers-color-scheme` 媒体查询，用户可手动 toggle）。组件里**永不**硬编码颜色，只用 token 名。

**调色板基调**：Notion-warm。从 v0 redesign 迁过来的：
- 底色不是纯白，是带轻微暖调的 cream（`oklch(0.99 0.002 90)`）
- 主文字不是纯黑，是带蓝调的 slate（`oklch(0.23 0.02 260)`）
- 单一 accent：暖橙（`oklch(0.65 0.12 45)`），**只**用于 eyebrow（`OUR PHILOSOPHY`、`YOUR QUESTION`、`BRIEF`、`READ`、`OVERVIEW`）

核心 token：

| Token | 用途 |
|---|---|
| `--background` / `--foreground` | 页面底色 / 主文字 |
| `--card` / `--card-foreground` | 卡片底色（比 background 略亮一点的纯白）、卡片内文字 |
| `--secondary` / `--secondary-foreground` | 次要 panel 底色（如 ChapterListPane 左栏 `bg-secondary/30`、PDF 区 `bg-secondary/20`） |
| `--muted` / `--muted-foreground` | 次要文字（章节 reason、caption、placeholder） |
| `--border` | 所有 1px 描边 |
| `--primary` / `--primary-foreground` | 实心 pill 按钮（与 foreground 同色调，反向 contrast） |
| `--accent` / `--accent-foreground` | **仅** eyebrow 文字色 / 极少处装饰 |
| `--destructive` | 错误文案、Delete book 菜单项 |
| `--ring` | focus ring |

`.dark` 节点把所有这些都换成 dark 版本（warm-cream → 深 navy-slate `oklch(0.16 0.015 260)`，slate-fg → 浅 cream，accent 稍提亮一点便于 dark 下可读）。

### 2.2 字体

```ts
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
```

挂在 `<html>` className，CSS variable 形式。所有正文走 `--font-geist-sans`（默认）；mono 没用到。

### 2.3 排版尺度

| Class | 用法 |
|---|---|
| `text-4xl/5xl/6xl font-semibold` | landing 大标题 |
| `text-3xl md:text-4xl font-semibold` | 内页 H1（书名 / "Your Library"） |
| `text-2xl semibold` | section 标题（"Ask the book"、CTA card 标题） |
| `text-xl semibold` | pane H2（Brief / Read 章节标题） |
| `text-lg` | 重点正文（Question Result 左栏的问题、Hero 副标） |
| `text-base` | 默认正文 |
| `text-sm` | 次要正文（章节 reason、列表项、表单 label） |
| `text-xs uppercase tracking-wider text-muted-foreground` | 普通 eyebrow |
| `text-xs uppercase tracking-wider text-accent` | **强调** eyebrow（橙色，焦点用） |
| `text-xs text-muted-foreground` | caption / 辅助文字 |
| `tabular-nums` | 数字相关（缩放百分比、页码） |

**font-weight 三档**：`normal`（400，正文）/ `medium`（500，强调 / 卡片标题）/ `semibold`（600，page H1 / hero）。不用 `bold`。

**Sentence case** 默认（"Ask the book"、"Your library"）；只有 eyebrow 用 `uppercase tracking-wider`。Hero 标题"Vibe Reading / Read with Questions" 是用户指定的 Title Case，是个例外。

### 2.4 间距 / 圆角 / 边框 / 阴影

- **gap / padding** Tailwind 标准刻度：`gap-{2,3,4,6,8,10,12}`，`px-{3,4,6,8}`，`py-{1.5,2,3,4,6,12,16}`
- **圆角** 现在用四档：
  - `rounded-md`（小按钮、icon button、ToolbarButton）
  - `rounded-lg`（输入框、primary pill 按钮、对话框）
  - **`rounded-xl`**（卡片、Pane 容器、PDF 工具条 —— **最常见**）
  - `rounded-2xl`（CTA 大盒）
- **边框** 永远 1px `border-border`；空状态用 `border-2 border-dashed border-border`
- **阴影**：极少。`shadow-sm` 给三种东西用：(1) PDF 翻页时和背景区分，(2) Question Result 中 active 章节卡片，(3) Highlight & Ask 选区卡片
- **--radius 基础值**：`0.75rem`（v0 调过来的，比之前 `0.625rem` 略圆）

---

## 3. 组件分层

### 3.1 文件组织

```
components/
├── ui/                       ← shadcn 标准目录
│   └── button.tsx            ← 唯一 install 的 shadcn 原子，目前没主动用
├── Nav.tsx                   ← 全站 sticky nav
├── ThemeToggle.tsx           ← Sun/Moon 切换按钮
├── UploadDropzone.tsx        ← Landing 上的 drag-drop 区
├── UploadCtaButton.tsx       ← Landing CTA 区的 client 按钮（拆出来给 server page 用）
├── LoginModal.tsx            ← (Reserved) 登录 modal，v2 没在用
├── BookHomeScreen.tsx        ← /b/[id] 整页内容（client，question 输入 + 历史）
├── QuestionResultScreen.tsx  ← /b/[id]/q/[qid] 的左右分屏壳
├── ChapterListPane.tsx       ← Question Result 左栏（matched chapters）
├── BriefPane.tsx             ← Question Result 右栏 (Brief 模式，加载 4 段式)
├── ReadPane.tsx              ← Question Result 右栏 (Read 模式 + Highlight & Ask 侧栏)
├── PdfViewer.tsx             ← react-pdf 封装：zoom + 页码跳 + 键盘 + lazy mount
├── LibraryList.tsx           ← /library 客户端列表（加 delete-book 菜单）
└── RestateScreen.tsx         ← (Reserved v1.1) 不挂路由
```

### 3.2 Server Component vs Client Component

约定：

- **Page (`app/**/page.tsx`)** 永远是 server component，负责：
  - 验证 auth (`createServerSupabaseClient().auth.getUser()`)
  - 数据查询（admin client，bypass RLS）
  - Storage signed URL 生成
  - 把 plain props 传给 client 组件
- **Screen / Pane / List 组件** 永远是 client (`'use client'`)，负责：
  - 用户交互（点击、输入、selection、拖放）
  - 客户端 fetch（`/api/question` / `/api/brief` / `/api/ask` / `/api/books/[id]` / `/api/question/[id]/retry`）
  - 本地 state（active chapter、loading、error、active pane mode）

**没有用 server actions** —— 所有 mutation 走传统 REST `/api/*` route handlers，便于测试。

### 3.3 Tiny client wrapper 模式

某些 server page 里有 1 个交互按钮（landing 的 CTA），不能挂 onClick。模式：把那一颗按钮抽成 `'use client'` 文件（如 `UploadCtaButton.tsx`），page 直接 import。3 行 wrapper，零 useState 也 OK。

### 3.4 没大量用 shadcn 的原因

`shadcn init` 跑了，但只装了 `button.tsx` 一个原子，且**没在产品代码里用**。所有按钮都是 `<button class="rounded-lg bg-primary px-... ">` 这种纯 Tailwind 写法。

**为什么手写不抄 shadcn**：
1. MVP 期需要的组件都很简单（按钮、输入框、textarea、卡片、链接、dropdown），shadcn 抽象的 `<Button variant="...">` 反而绕一圈
2. 想保持 "1 个 div + N 条 Tailwind class" 的可读性 —— 改样式不用跳到 button.tsx
3. shadcn 的 cva (class-variance-authority) 在我们这套**单一视觉语言**下没意义

未来如果要做表单、tooltip、command palette 这类复杂组件，再 `npx shadcn add` 拉。MVP 不预先抽象。

---

## 4. 布局模式

### 4.1 容器宽度

| 页面 | 容器宽 | 备注 |
|---|---|---|
| `/`（landing） | `max-w-3xl` (hero) / `max-w-5xl` (features) / `max-w-xl` (dropzone) | 多段不同宽度，节奏感 |
| `/library` | `max-w-2xl` | 书列表 |
| `/b/[bookId]`（Book Home） | `max-w-3xl` | TOC + 推荐问题 + 历史 |
| `/b/[bookId]/q/[qid]`（Question Result） | 全屏 `grid-cols-[2fr_3fr]` | 左右分屏，无外边距 |
| `/auth/{login,register}` | `max-w-sm` | 单列窄表单 |

非分屏页都用 `mx-auto flex-col gap-{N} px-6 py-{12,16}` 居中堆叠。

### 4.2 全站 Sticky Nav

`components/Nav.tsx` 挂在根 `app/layout.tsx`：

```
[ 📖 Vibe Reading ]                  [ Library ] [ Sign out ] [ ☀ ]
```

- **登录态**：`Library | Sign out | ThemeToggle`
- **登出态**：`Sign in | Sign up | ThemeToggle`（Sign up 是实心 pill，自动带 `?next=<current>`）
- **自隐藏路径**：`/b/[id]/q/[qid]`（全屏分屏抢空间）+ `/auth/*`（auth 流自成一体）

Pathname 判断在 client（`usePathname()`），auth 状态从 root layout server-fetch 一次往下传 prop —— **首屏不闪烁**。

### 4.3 ThemeToggle 与 dark mode

`components/ThemeToggle.tsx` + `app/layout.tsx <head>` 内联脚本：

```html
<script>
(function(){
  try {
    var stored = localStorage.getItem('vr-theme')
    var prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
    if (stored === 'dark' || (!stored && prefersDark))
      document.documentElement.classList.add('dark')
  } catch(e) {}
})()
</script>
```

- **首次访问**：跟 OS preference 走
- **点了 toggle**：locks to 用户选择（`localStorage('vr-theme')`）
- **reload**：内联脚本在 React hydrate 之前就把 `dark` class 挂上 `<html>` —— **不闪**

### 4.4 分屏（Question Result）

```
┌────────────────────┬──────────────────────────────┐
│ ChapterListPane    │ BriefPane / ReadPane         │
│ (2fr)              │ (3fr)                        │
│ bg-secondary/30    │ bg-background                │
│ scrollable         │ scrollable + sticky header   │
└────────────────────┴──────────────────────────────┘
```

`grid-cols-[2fr_3fr]` 比例，左右各自 `overflow-y-auto`。右栏内容由 `useState<ActivePane>` 决定，挂 `key={chapterId}` 触发 unmount/remount —— 切章节时自动重置 selection / ask history。

左栏轻微 `bg-secondary/30` 跟右栏分层。

### 4.5 PDF Viewer

`components/PdfViewer.tsx` —— 是个小产品：

- `dynamic(() => import(...), { ssr: false })`（react-pdf 在 SSR 里炸 worker）
- `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` —— **self-host** 在 `public/`，不走 CDN
- **Sticky 工具条**：`[ 100% ] [ Page __ / N ]      [−][⛶][+]`
- **缩放**：50%–300%，每次 ±10%，"⛶" 一键回 fit-width（基于 ResizeObserver 测的容器宽度）
- **键盘快捷键**：`+`/`=` 放大、`-`/`_` 缩小、`0` fit-width、`g` 聚焦页码输入框（在表单输入里时不拦截，按住 Cmd/Ctrl 时不拦截）
- **页码跳转**：toolbar 里 number input + Enter，或 `g` 聚焦它
- **Reserved-space lazy mount**：每页用 `IntersectionObserver`（800px preload margin）按需 mount；未 mount 时 wrapper 用 letter aspect ratio (8.5:11) 预留高度
- **`useDeferredValue`**：rapid +/− click 合并成一次 re-render
- 三个一起 → load + zoom 都不再 white-flash

---

## 5. 视觉哲学的几条铁律

写代码时贯穿到底的潜规则：

1. **单 accent**。整站只有一条颜色梯度（warm-cream / slate-blue 灰阶 + 一条 warm-orange accent）。**不引第二种 accent ramp**（无蓝绿青多色 callout）。
2. **极少装饰**。没 hero 图、没插图、没 illustration、没 logo（只有 metadata 里的小 favicon SVG）。Lucide icon 是功能性 glyph，不是装饰。
3. **行高 / 留白靠 Tailwind 默认**。重点段落用 `leading-relaxed`，hero 大标题 `leading-tight`。
4. **错误 / loading 用文字 + 简单 icon**。没 spinner 动画（除 `RefreshCw` 在 retrying 时 spin）、没骨架屏、没 shimmer。Loading 一律 `<p class="text-sm text-muted-foreground">Reading the chapter…</p>` 或 PDF 的 `Loading page N…` 占位符。
5. **按钮文案带方向箭头**。CTA 用 `→` 收尾（"Ask →"、"Sign in →"），二级用 `←` 开头（"← Back to book"）。是产品立场的视觉延伸 —— "读书是一段有方向的旅程"。
6. **eyebrow + title + body 三档**。多个屏共享：
   ```
   <p class="text-xs uppercase tracking-wider text-accent">YOUR QUESTION</p>
   <h2 class="text-lg leading-snug">{questionText}</h2>
   <p class="text-sm leading-relaxed text-muted-foreground">{reason}</p>
   ```
   橙色 eyebrow（`text-accent`）只给"焦点 region"用：landing 的 OUR PHILOSOPHY、Book Home 的 OVERVIEW、Question Result 左栏的 YOUR QUESTION、Brief/Read pane 的 BRIEF/READ。其它都是 `text-muted-foreground` 灰 eyebrow。

---

## 6. 设计来源 / 参考

UI 不是从单一 mockup 译过来的。**没有 Figma 文件，没有 design lead**。一切由 Claude（我，Opus 4.7）根据 spec + 既有项目惯例 + 一次 v0 redesign 写出来。

| 来源 | 借了什么 |
|---|---|
| **`stack/STANDARD.md`** (indie-product-playbook) | Auth UX 铁律（"Sign in / Sign up same modal"、`?next=` 防开放重定向、callback 内联 claim） |
| **`launchradar` 姊妹项目** | Supabase + Tailwind 项目结构；环境变量分层 |
| **`growpilot` 姊妹项目** | Sticky nav 的视觉模式（`backdrop-blur` + `border-b` + 左品牌 / 右按钮组）。**只参考结构，没抄代码** |
| **v0.dev** | landing redesign 的视觉方向（Notion-warm token 调色板、rounded-xl 卡片 + 36×36 icon-in-square 模式、3-feature tile grid 布局）。`ui_design/v0_landing_page/` 留 reference 用，**git 不上传** |
| **`snowboat-blog` 的 baoyu-diagram skill** | docs 里的 SVG 图（product flow、tech pipeline）的设计系统 —— 跟产品 UI 是两回事，但视觉语言一脉相承 |
| **shadcn 的 base-nova style** | CSS variable 命名约定（`--background` / `--foreground` / `--muted` 等） |

---

## 7. Spec 留口子但没做的

| 功能 | 状态 |
|---|---|
| 移动端响应式 | spec 明说"桌面 web only"，所以**没做**。`grid-cols-[2fr_3fr]` 在 mobile 上塌成 1 列（用 `lg:` breakpoint 守了），但其它细节没专门 mobile-tuned |
| Dark mode toggle | ✅ **shipped 2026-04-26**（Sun/Moon 按钮在 Nav）|
| Loading skeleton / shimmer | 故意不做（见 §5 第 4 条）。例外：PDF 页面有 reserved-space placeholder（不是 shimmer，是文字占位） |
| 动画 / transition | 几乎不做。Tailwind `transition-colors` / `transition-opacity` hover 状态外，无入场动画 |
| Toast / notification | 没用 toast 库；错误一律 inline 红字 / `window.alert`（删除 / 重试场景） |
| Modal / dialog | 删书用 `window.confirm()`（足够 MVP）；未来需要复杂 modal 时 `npx shadcn add dialog` |
| 头像 / avatar / user dropdown | Nav 故意只显 "Sign out" 文字链接，没头像 |
| Form validation library | 不用 react-hook-form / zod —— 表单都是简单 controlled input + 手写 validation |

---

## 8. 给后续优化的提示

UI 已经做过 v0 redesign + 全屏 token 统一了。下一波优化重点（其它列在 `docs/todo.md`）：

1. **landing hero 仍偏轻**。现在是大字标题 + 一句 + dropzone + 哲学引文 + 3 feature tile + CTA。可以加产品截图 / GIF / 社会证明（一旦有了用户）
2. **Book Home 信息密度高但分层一般**。TOC 长（一本 23 章的书 175 条 entry），suggested questions、history 在同一垂直流。可以两栏 / 折叠 TOC / sticky question 输入区
3. **Question Result 左栏 chapter 卡片**：还可以加 AI rank 角标（"AI's top pick"）、章节预估阅读时间、上次访问 timestamp 之类
4. **PDF viewer**：缺侧栏缩略图、文字搜索框（pdf.js find controller 没接进来）
5. **/library 卡片**：现在只有书名 / 作者 / 创建日期。加封面缩略图 / 上次问的问题 / 章节进度（todo.md A 还有这条没做）
6. **空状态 empty state**：`/library` 那个 dashed border 漂亮；Book Home / Question Result 在 AI 失败时仍然简陋
7. **错误状态**：`/api/upload` 失败用了 dropzone 内联红字（OK），其它如 delete book 失败用 `window.alert`（粗暴）

---

## 9. 总结一句

> 这套 UI 是 spec + 视觉极简哲学 + 一次 v0 视觉跳板**反向倒逼**写出来的。
> 框架是 Next.js 16 + Tailwind v4 + shadcn 装了几乎没用；视觉是 Notion-warm 单色 + 单 warm-orange accent + sentence case；动画近 0；所有复杂组件（dropdown、modal、toggle）都是手写。
> 优先级永远是 **"正确 > 一致 > 美观"**。
