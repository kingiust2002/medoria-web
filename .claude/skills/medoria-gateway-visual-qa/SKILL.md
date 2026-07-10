---
name: medoria-gateway-visual-qa
description: Run real-browser visual QA for the Medoria gateway and vertical routes using Playwright screenshots. Use after any change to the gateway, shared layout, brand assets, or global CSS — and before opening a design PR.
---

# Medoria Gateway Visual QA

Verify with REAL screenshots. Never claim visual verification happened
without images — if the browser cannot run, say so clearly and hand the
owner the manual preview steps at the bottom.

## Routes to check

- `/` (the gateway)
- `/health/tg` · `/health/ru` · `/health/en` · `/health/fa` (RTL)
- `/beauty/tg` · `/beauty/ru` · `/beauty/en` · `/beauty/fa` (RTL)

## Gateway states (desktop 1440×900 @2x and mobile 390×844 @2x)

1. Idle after entrance (wait ≥2.4s after networkidle).
2. Pointer steered far LEFT (Beauty floods) and far RIGHT (Health floods) —
   verify the seam moves, the opposite door dims (md+), content stays legible.
3. Keyboard: Tab to each CTA — focus ring visible, seam pulls toward the
   focused world.
4. Reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`):
   seam static at 50%, no autopan, page complete.
5. JS disabled (`javaScriptEnabled: false` in context): static 50/50
   composition, all content present.
6. All 8 entry links present in SSR HTML:
   `curl -s <base>/ | grep -o 'href="/health/[a-z]*"\|href="/beauty/[a-z]*"'`
   → expect health/beauty × tg/ru/en (+ the two default-locale CTA links);
   and confirm NO auto-forward (no redirect/meta-refresh on `/`).

## How to run in the Claude Code cloud sandbox (known-good pattern)

Playwright browsers are PRE-INSTALLED — never run `npx playwright install`.

```bash
npm run build && (PORT=3900 nohup npm start >/tmp/srv.log 2>&1 &) && sleep 5
# if playwright-core isn't present: npm i playwright-core --no-save
NODE_PATH=$PWD/node_modules node shots.js
```

```js
// shots.js — launch pattern that works in this sandbox
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', // or /opt/pw-browsers/chromium
  args: ['--no-sandbox', '--disable-gpu'],
});
```

Gotchas learned in this repo:
- Kill stale `next-server` processes by PID (`ps aux | grep next-server`)
  before restarting, or the old server serves a dead build (CSS 400s).
- For scroll-to-bottom shots, scroll → wait 1s → scroll again (layout keeps
  growing after networkidle).
- View every screenshot before declaring pass; a blank capture is a finding.

## If the browser cannot run

State it plainly, then give the owner these manual steps: open the Vercel
preview URL for the PR branch; check `/` on a laptop (move the mouse across,
Tab through CTAs) and on a phone (drag across the scene); spot-check one
`/health/*` and one `/beauty/*` route per language including `fa` RTL.
