@AGENTS.md

## Workflow conventions

- **CHANGELOG.md is kept current.** After every meaningful change (user-visible
  feature, behavior change, architectural decision, bug fix worth remembering),
  add a one-line entry under the current version's most-recent date subsection
  in `CHANGELOG.md`. Categories follow Keep-a-Changelog: Added / Changed /
  Fixed / Removed. Skip CI noise, doc-only typo fixes, and pure refactors with
  no observable effect — they live in `git log` only. The CHANGELOG and the
  commit go in the **same** push so a returning reader can `git log -- CHANGELOG.md`
  to navigate history.
- Commit + push after every completed change (no batching). Push to `main`
  directly is allowed; PR-only branches get rejected by the configured rule
  unless the user explicitly approves.

## Setup Blockers（开工前读）

历史上遇到过的非显然 setup 坑。记下来是为了下次 session / 下个开发者不再重复踩。每条只记事实 + 教训；过程对话在 git log 里查。

### 2026-04-22 — Supabase schema 建立（`vr`）+ RLS

**症状**：SQL 跑完 Table Editor 看不到表；supabase-js 查 `vr` 表返回 `PGRST106: Invalid schema: vr`；anon key 报 `permission denied for schema vr`。

**根因**：4 件事叠加。(1) SQL Editor 粘贴 ≠ 执行，要按 Cmd/Ctrl+Enter 或点 Run。(2) Table Editor 左上角默认只显示 `public` schema，要切到 `vr` 才能看到表。(3) 自定义 schema 必须手动加到 Dashboard → Settings → Data API → Exposed schemas（老 UI 在 Settings → API），不然 supabase-js 永远 404。(4) 自定义 schema 不像 `public` 会自动有 grants，要显式 `grant usage on schema vr to service_role, authenticated` + `alter default privileges ...`。

**解法**：SQL 里包含 `create schema if not exists vr` + 所有 grants + 每张表 `enable row level security` + policies；Dashboard 切 Table Editor schema 下拉到 `vr` 验证；Settings → Data API → Exposed schemas 加 `vr` → Save。

**教训**：**Dashboard 视觉不等于 API 可达**。看到下拉里有 `vr` / 表存在 / Save 按钮颜色变了——都不代表 supabase-js 能连上。永远用探针脚本验证：service_role 应通（count 返回数字），anon 应被挡（permission denied 或 0 行）。这次最大时间浪费就是反复相信截图里的 UI 状态而没跑探针。

### 2026-04-22 — Google OAuth 启用 + Vercel 部署

**症状**：浏览器点 "Continue with Google" 报 `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`。修完之后推到 Vercel，线上又 500 `MIDDLEWARE_INVOCATION_FAILED`（build 显示 Ready）。

**根因**：两个独立问题。(1) Supabase project 和 launchradar 共享，但 launchradar 的 login 页只有 Email，所以 Google provider 从没在 Supabase Dashboard 启用过——"共享 project，launchradar 能跑"**不蕴含**"Google 能跑"，每个 provider 要独立确认。(2) Vercel Production 没配 Supabase env vars，middleware 在每次请求调 `createServerClient(undefined, undefined)` 直接崩。build 成功只代表 TypeScript 编译过，不代表 runtime OK。

**解法**：(Google) Google Cloud Console → Dong's Indie Project → 建新 OAuth Client 叫 `vibe-reading`，redirect URI `https://<supabase-ref>.supabase.co/auth/v1/callback` → Supabase Dashboard → Auth → Providers → Google 粘 Client ID + Secret → Save。(Vercel) Dashboard → Settings → Environment Variables → 用 "Paste .env" tab 批量粘 6 个变量 → 手动 Redeploy（Vercel 不因 env 改动自动重部）。

**教训**：两条，互相独立。(A) 共享 Supabase project 的每个 Auth provider 都要在 Dashboard 逐个**目视确认** toggle on + Client ID 填了，不能用"别的 app 能跑"做推论。(B) Vercel 的 `Deploy Success` 是 build 级别，不是 runtime 级别。Middleware / Edge function 在首个请求才被 invoke，env 缺失会 500。推完必须立即访问 `/` 和一个保护路由实测，不是看 Dashboard 绿灯。
