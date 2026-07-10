# Medoria — permanent project rules

One repo, one house, two equal verticals: **Medoria Health** (B2B medical,
navy/silver/glacial) and **Medoria Beauty** (luxury cosmetics,
ivory/champagne/copper). Gateway at `/` presents both and routes to
`/health/{lang}` and `/beauty/{lang}`.

## Process

- Work on PR branches only — never commit to `main`.
- Never commit secrets; never add client-side API keys.
- Never ask the owner for a PAT when the GitHub App/connector path is
  available — use the built-in GitHub tools.
- Always run `npm run lint`, `npm test`, and `npm run build` before a PR.
- Design work is not done until real-screenshot visual QA ran
  (`medoria-gateway-visual-qa`) and was reviewed.

## Brand law (details: `.claude/skills/medoria-brand-guardian`)

- Health and Beauty are equal; neither dominates shared surfaces.
- Each vertical uses ONLY its own logo/wordmark in its own zone; the master
  Medoria mark/wordmark is the only neutral parent branding. No cross-logo
  usage, no redrawing official assets.
- No fake claims, certifications, awards, reviews, or statistics.

## Scope law

- Do not modify Health or Beauty inner pages during gateway work unless
  explicitly requested.
- Do not touch database, admin/operator, auth, middleware, Supabase, or
  Vercel/production config unless explicitly requested.

## Localization law

- Tajik-first (`tg` default), then Russian and English; short stylistic
  micro-labels may be Latin. Preserve the hidden Persian `fa` RTL routes
  (Vazirmatn fallbacks; brand lockups stay `dir="ltr"`).

## Gateway law

- Server-rendered and crawlable: all 8 entry links in the HTML, works
  JS-off, never auto-forwards.
- Heavy effects (WebGL/video/particles) are dynamically imported, gated
  (reduced-motion, save-data, low cores, small screens), paused offscreen,
  and fully disposed. See `.claude/skills/medoria-performance-a11y-gate`.

## Project skills

`medoria-brand-guardian` · `medoria-gateway-creative-qa` ·
`medoria-gateway-visual-qa` · `medoria-performance-a11y-gate` ·
`medoria-asset-director` · `medoria-pr-ready`
