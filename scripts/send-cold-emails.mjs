#!/usr/bin/env node
// Batch-send the cold reach-out emails from marketing/cold-reachout-2026-05-09.txt
// via Gmail SMTP. Each send appears in your Sent folder like a real personal
// email — no BCC, no mass-mail headers.
//
// Setup:
//   1. Enable 2FA on your Google account.
//   2. Create an App Password: https://myaccount.google.com/apppasswords
//   3. Add to .env.local:
//        GMAIL_USER=dongzhanghz@gmail.com
//        GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
//   4. npm install --save-dev nodemailer
//
// Usage:
//   node scripts/send-cold-emails.mjs --dry-run               # preview parsed blocks
//   node scripts/send-cold-emails.mjs --from 8 --to 10        # send #8 through #10
//   node scripts/send-cold-emails.mjs --from 8 --to 31        # send all remaining
//   node scripts/send-cold-emails.mjs --from 8 --delay-sec 8  # slower pacing
//
// State tracking:
//   marketing/sent-state.json keeps {email: timestamp} of every successful send.
//   Re-running the script SKIPS anyone in that file (safe to re-run, no double-sends).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import nodemailer from 'nodemailer'

// ─── env ──────────────────────────────────────────────────────────
const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

// ─── args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
if (!DRY_RUN && (!GMAIL_USER || !GMAIL_APP_PASSWORD)) {
  console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env.local. See header comment.')
  process.exit(1)
}
const fromIdx = parseInt(getArg('--from') ?? '8', 10)
const toIdx = parseInt(getArg('--to') ?? '31', 10)
const DELAY_SEC = parseInt(getArg('--delay-sec') ?? '5', 10)

function getArg(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

// ─── parse the txt ────────────────────────────────────────────────
// Default to today's batch under marketing/. Override with `--file <path>`.
const FILE_ARG = getArg('--file')
const today = new Date().toISOString().slice(0, 10)
const DEFAULT_TXT = `marketing/cold-reachout-${today}.txt`
const TXT_PATH = resolve(process.cwd(), FILE_ARG ?? DEFAULT_TXT)
if (!existsSync(TXT_PATH)) {
  console.error(`Reach-out file not found: ${TXT_PATH}`)
  console.error(`Either generate today's batch (node scripts/draft-cold-emails.mjs)`)
  console.error(`or pass an explicit one: --file marketing/cold-reachout-YYYY-MM-DD.txt`)
  process.exit(1)
}
const raw = readFileSync(TXT_PATH, 'utf8')

// Split on the separator headers like: ─────────────── 8/31 ───────────────
// Track BOTH the position of the separator's leading newline (sepStart) AND
// the position right after the separator (bodyStart). Block i's text runs
// from bodyStart[i] to sepStart[i+1] — i.e. EXCLUSIVE of the next separator,
// otherwise the next block's "─── 9/31 ───" header leaks into block i's body.
const SEP = /\n─{15} (\d+)\/\d+ ─{15}\n/g
const matches = []
let m
while ((m = SEP.exec(raw)) !== null) {
  matches.push({
    n: parseInt(m[1], 10),
    sepStart: m.index,
    bodyStart: m.index + m[0].length,
  })
}

const blocks = []
for (let i = 0; i < matches.length; i++) {
  const start = matches[i].bodyStart
  const end = i + 1 < matches.length ? matches[i + 1].sepStart : raw.length
  blocks.push({ n: matches[i].n, text: raw.slice(start, end).trim() })
}

function parseBlock(block) {
  const toMatch = block.text.match(/^TO:\s*(.+)$/m)
  const subjMatch = block.text.match(/^SUBJECT:\s*(.+)$/m)
  if (!toMatch || !subjMatch) return null
  // Body = everything after the SUBJECT line's blank line, up to end (which is
  // already trimmed of the next-block separator).
  const subjEnd = subjMatch.index + subjMatch[0].length
  const blankIdx = block.text.indexOf('\n\n', subjEnd)
  const body = block.text.slice(blankIdx + 2).trim()
  return {
    n: block.n,
    to: toMatch[1].trim(),
    subject: subjMatch[1].trim(),
    body,
  }
}

// ─── master sent-emails registry (skip-list + audit log) ──────────
// One file across all batches. Email keys are lowercased so a future batch
// won't double-send to "Foo@gmail.com" if "foo@gmail.com" is already there.
const REGISTRY_PATH = resolve(process.cwd(), 'marketing/sent-emails.json')
const registry = existsSync(REGISTRY_PATH)
  ? JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  : {}

function alreadySent(email) {
  return registry[email.toLowerCase()] !== undefined
}

function recordSent(email, { template, firstNameUsed }) {
  registry[email.toLowerCase()] = {
    sent_at: new Date().toISOString(),
    template,
    first_name_used: firstNameUsed,
  }
  // Stable key order keeps diffs readable; preserve _schema if present.
  const ordered = {}
  if (registry._schema) ordered._schema = registry._schema
  for (const k of Object.keys(registry).filter((k) => k !== '_schema').sort()) {
    ordered[k] = registry[k]
  }
  writeFileSync(REGISTRY_PATH, JSON.stringify(ordered, null, 2) + '\n')
}

function inferTemplate(subject) {
  if (subject.includes('注册之后还顺利')) return 'C'
  return 'A'
}

function inferFirstName(body) {
  const firstLine = body.split('\n')[0].trim()
  if (firstLine.startsWith('Hi ')) return firstLine.replace(/^Hi\s+/, '').replace(/[，,]\s*$/, '')
  if (firstLine.startsWith('亲爱的朋友')) return '亲爱的朋友'
  return firstLine.slice(0, 20)
}

// ─── main ─────────────────────────────────────────────────────────
const targets = blocks
  .map(parseBlock)
  .filter((b) => b !== null && b.n >= fromIdx && b.n <= toIdx)

console.log(
  `Selected ${targets.length} email(s) (#${fromIdx}-${toIdx}). Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE SEND'}`,
)
console.log(`Pacing: ${DELAY_SEC}s between sends.\n`)

if (DRY_RUN) {
  for (const e of targets) {
    const skip = alreadySent(e.to) ? `  [SKIP — already in sent-emails.json]` : ''
    console.log(`#${e.n}  →  ${e.to}${skip}`)
    console.log(`  Subject: ${e.subject}`)
    console.log(`  First line: ${e.body.split('\n')[0]}`)
    console.log()
  }
  console.log('Dry run only. Re-run without --dry-run to actually send.')
  process.exit(0)
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
})

await transporter.verify().catch((err) => {
  console.error('Gmail SMTP auth failed:', err.message)
  console.error('Check GMAIL_USER + GMAIL_APP_PASSWORD in .env.local.')
  process.exit(1)
})
console.log(`SMTP auth OK as ${GMAIL_USER}\n`)

let sentCount = 0
let skippedCount = 0
for (const e of targets) {
  if (alreadySent(e.to)) {
    const prev = registry[e.to.toLowerCase()]
    console.log(`#${e.n}  ${e.to}  [SKIP — already sent ${prev.sent_at}]`)
    skippedCount += 1
    continue
  }
  process.stdout.write(`#${e.n}  ${e.to}  ... `)
  try {
    const info = await transporter.sendMail({
      from: `Dong Zhang <${GMAIL_USER}>`,
      to: e.to,
      subject: e.subject,
      text: e.body,
    })
    recordSent(e.to, {
      template: inferTemplate(e.subject),
      firstNameUsed: inferFirstName(e.body),
    })
    console.log(`sent (id=${info.messageId})`)
    sentCount += 1
  } catch (err) {
    console.log(`FAILED: ${err.message}`)
  }
  // Pace between sends so Gmail doesn't flag burst behavior.
  if (e !== targets[targets.length - 1]) {
    await new Promise((r) => setTimeout(r, DELAY_SEC * 1000))
  }
}

console.log(`\nDone. Sent ${sentCount}, skipped ${skippedCount}, total ${targets.length}.`)
