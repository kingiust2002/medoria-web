---
name: medoria-brand-guardian
description: Check Medoria brand law before and after any design change that touches logos, wordmarks, colors, copy tone, or the relationship between the Health and Beauty verticals. Use before starting design work to load the rules, and after finishing to audit the diff against them.
---

# Medoria Brand Guardian

Audit the working diff (or the pages named by the user) against Medoria brand
law. Report violations with file/line and a concrete fix. If there are no
violations, say so explicitly per rule group — do not rubber-stamp.

## Identity law

- Health and Beauty are EQUAL verticals of one house. Neither may visually
  dominate the other on shared surfaces (gateway, parent branding, metadata).
- The Health logo/wordmark (`/images/Health.png`, health lockups) appears
  ONLY in Health zones: `app/health/**`, Health panels/doors of the gateway.
- The Beauty logo/wordmark (`/images/Beauty.png`, `/brand/beauty-*`) appears
  ONLY in Beauty zones: `app/beauty/**`, Beauty panels/doors of the gateway.
- The master Medoria mark + "Medoria" wordmark (`/logo-mark.png`,
  `/brand/wordmark-navy.png`, `/brand/wordmark-white.png`) is the ONLY
  branding allowed in neutral/parent positions (gateway header, shared
  footer copyright).
- NO cross-logo usage — never a Beauty wordmark in a Health zone or vice
  versa, never recolor one vertical's assets into the other's palette.
- Official assets are used as-is: never redrawn, stretched, recolored, or
  reconstructed in CSS when a real asset exists.

## Mood law

- Health must read premium-medical: navy ink, surgical silver, glacial
  blue-white light, precision, trust. Tokens: the default/health `--v-*`
  layer in `app/globals.css`.
- Beauty must read premium-cosmetic: warm ivory, champagne `#F3DCBE`,
  copper `#C87D4E`, deep navy ink, sensual ritual, quiet elegance. Tokens:
  `[data-vertical="beauty"]` layer. Serif: Playfair (`--font-beauty`).
- B2B/clinical wording is banned from Beauty copy; sensual/vague wording is
  banned from Health copy.

## Truth law

- No fake claims, certifications, awards, reviews, statistics, or product
  claims anywhere. If copy asserts a fact (partner counts, delivery times,
  certifications), it must already exist in the codebase copy approved by
  the owner — never invent new ones.

## Language law

- Tajik-first: `tg` is the default locale and the first-class copy.
  Russian and English follow. Stylistic micro-labels may be short Latin.
- Hidden Persian RTL (`fa`) must not break: check `dir="rtl"` handling,
  `[dir="rtl"]` font fallbacks (Vazirmatn), and that brand lockups keep
  `dir="ltr"` so they never mirror.

## How to audit

1. `git diff origin/main --stat` to scope what changed.
2. Grep changed files for asset paths (`Health.png`, `Beauty.png`,
   `beauty-wordmark`, `wordmark-navy`, `logo-mark`) and verify each usage's
   zone per the identity law.
3. Read changed copy strings in all locales touched (`lib/i18n.js`,
   `components/beauty/i18n.js`, gateway copy) against mood/truth/language law.
4. Report as a checklist: rule → pass/violation → fix.
