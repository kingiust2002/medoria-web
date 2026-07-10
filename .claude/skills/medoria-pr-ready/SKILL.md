---
name: medoria-pr-ready
description: Final pre-PR checklist for Medoria — verify scope, quality gates, and produce the exact PR title/body. Use as the last step before opening any pull request in this repository.
---

# Medoria PR-Ready

Assemble the final report. Every line below must appear in the output with
a real answer — "not checked" is a failing answer, run the check instead.

## Scope audit

- Branch name (must be a PR branch, never `main`).
- `git diff origin/main --stat` — full file list.
- Did Health inner pages change? (`app/health/**`, `components/home/**`,
  `components/layout/**` used by Health) — yes/no + why.
- Did Beauty inner pages change? (`app/beauty/**`, `components/beauty/**`)
  — yes/no + why.
- Did the Gateway change? (`app/page.jsx`, `components/gateway/**`,
  gateway section of `app/globals.css`) — yes/no.
- Any change outside the requested scope must be listed and justified, or
  reverted before the PR.

## Quality gates (run them, paste real results)

- `npm run lint` — must be clean.
- `npm test` — all passing (currently 12 tests).
- `npm run build` — compiles; note the gateway route size vs before.
- All 8 gateway entry links present in built HTML (see
  `medoria-gateway-visual-qa`), and `/` never auto-forwards.
- Visual QA result: which screenshots were taken and reviewed (attach or
  reference); if the browser couldn't run, say so explicitly.
- Performance/a11y notes from `medoria-performance-a11y-gate`.
- Brand audit from `medoria-brand-guardian` when design/copy changed.

## Deliverable

1. Exact PR title (imperative, specific).
2. Exact PR body: what/why, per-fix breakdown, verification results,
   scope confirmation (Health/Beauty untouched unless requested), and any
   remaining risks with mitigations.
3. Remaining risks — spelled out (e.g. "video loop weight unverified on
   3G", "fa RTL spot-checked on one route only").
4. Reminder list of anything intentionally deferred.

Never claim a gate passed without having run it in this session.
