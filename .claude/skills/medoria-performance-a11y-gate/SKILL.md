---
name: medoria-performance-a11y-gate
description: Gate Medoria design changes on performance and accessibility — verify SSR, self-hosted assets, gated heavy effects, cleanup discipline, keyboard/contrast, and justified bundle growth. Use before any design PR and whenever WebGL, video, particles, or animation code changes.
---

# Medoria Performance & A11y Gate

Run every check against the working diff. Report pass/fail per item with
file/line evidence — a failed gate blocks the PR until fixed or explicitly
waived by the owner.

## Rendering & delivery

- SSR/crawlable HTML intact: key content and all gateway entry links exist
  in `curl`ed HTML, not injected client-side.
- No runtime external CDN, font, or script dependency — self-hosted only
  (`next/font`, local `/public` assets). Grep the diff for `http(s)://` in
  `src`/`href`/`url(` of runtime code.
- No client-side API keys or secrets (grep for `NEXT_PUBLIC_` additions and
  literal key patterns).
- LCP is the hero imagery: sized, optimized (<500KB per hero image ideally),
  `fetchPriority="high"`/preload on exactly the LCP candidates.
- No layout shift: every `<img>`/`<video>` has intrinsic dimensions or a
  reserved box; fonts already self-hosted with `variable` (no FOIT swaps).

## Heavy-effect discipline (WebGL / particles / shaders / video / big motion)

- Dynamically imported (`next/dynamic`, `ssr:false`) — never in the route's
  base bundle.
- Gated OFF for: `prefers-reduced-motion`, `navigator.connection.saveData`,
  `hardwareConcurrency < 4`, small screens (mobile) unless deliberately
  designed for touch.
- Paused when offscreen (IntersectionObserver) and on `visibilitychange`.
- Fully disposed on unmount: renderer, geometry, material, observers,
  `cancelAnimationFrame`, event listeners removed. Check the effect's
  cleanup return.
- Graceful fallback rendered when the effect never mounts (gradient/photo —
  the page must look designed without it).
- Videos: muted, `playsInline`, `loop`, poster image, a few MB max, and the
  poster/photo fallback path actually works.

## Interaction & a11y

- Full keyboard path: every CTA/link reachable, `:focus-visible` ring
  visible over imagery, no pointer-only functionality without a keyboard or
  static equivalent.
- `aria-hidden` on decorative layers; meaningful `aria-label`s on lockups
  and icon-only controls; landmarks intact.
- Contrast holds over the busiest region of the imagery (frosted panels or
  washes where needed) — verify on screenshots, not by assumption.
- RTL (`/health/fa`, `/beauty/fa`) unbroken; brand lockups stay `dir="ltr"`.

## Budget

- Compare `npm run build` route sizes before/after. Growth must be justified
  by visible value; the gateway route target is ≤ ~10 kB page JS (currently
  ~3 kB) with heavy media as static assets, not JS.
