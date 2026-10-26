# Analytics and privacy: the real state (checked 2026-10-25)

This is a factual inventory, not legal text. A privacy notice makes promises on the company's behalf and is subject to the law that applies to it, so the wording needs the owner's decision (and, if wanted, a lawyer). What is below is what the code and the live site really do, so the notice can be written from facts.

## 1. Visitor analytics: OFF

- Code: `components/shared/AnalyticsScripts.jsx` loads Google Analytics 4 and/or Yandex Metrica **only** if `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_YANDEX_METRICA_ID` was set when the container was built. `@vercel/analytics` is gone (deliberately removed in production).
- **Live site, read-only fetch on 2026-10-25** of `/`, `/health/en`, `/health/tg`, `/health/en/contact`, `/beauty/en`, `/beauty/ru`: no `googletagmanager`, `gtag`, `google-analytics`, `mc.yandex.ru` or `dataLayer` anywhere in the HTML; no `<script src>` outside `/_next/`. So no analytics id is set in the running build.
- The browser security policy used to allow Google/Yandex hosts anyway; it now allows a provider only when its id is configured (`docs/SECURITY_DECISIONS.md` §2).
- `scripts/check-self-host-env.mjs` now prints a **warning** (exit code unchanged) if an analytics id is set, pointing here, so enabling it is never silent.

**Before turning analytics on:** (1) publish the privacy notice; (2) decide about consent: GA4 and Metrica set cookies and send visitor data to Google / Yandex; visitors from the EU/UK and some other countries usually require prior consent (a banner that really blocks the scripts until accepted), Russian-law rules differ again. This is the owner's/lawyer's call. The code has **no consent mechanism**; if analytics is wanted for those visitors, the scripts must be loaded only after consent (a small change in `AnalyticsScripts.jsx`).

## 2. What the public site stores in the visitor's browser

Checked in the code and on the live response headers (public pages send **no `Set-Cookie`**):

| What | Where | Sent to the server? |
| --- | --- | --- |
| Chosen language (`lang`) | localStorage | no |
| Wishlist, compare list, recently-viewed product ids | localStorage | no |

No tracking pixels, no third-party fonts (fonts are served by the site), no third-party scripts (see §1). The product page counts a view with an anonymous server call (product id only; no visitor identifier is sent or stored).

The only cookies in the system belong to the operator panels' login (staff), not to visitors.

## 3. What the contact and quote forms collect and where it goes

Fields: name, organization, phone, message (an optional e-mail typed on the Health contact page is added to the message text), product name/SKU and quantity when sent from a product page, preferred channel, page language, and (Beauty) the page the visitor came from.

1. **Stored** in the company's own database (self-hosted Supabase on the company VPS) and shown in the operator panel of the matching house only. Rows stay until a team member deletes them (delete button exists since 2026-10-24); there is **no automatic retention limit**.
2. **Telegram notice** to a private team group: name, organization, product, quantity, preferred channel (and phone + message text only if `TELEGRAM_INCLUDE_DETAILS` is on; it is not set unless the owner chose so). This data therefore also sits on Telegram's servers.
3. **Backups**: the daily encrypted backup (including the request tables) is kept locally and in an encrypted Cloudflare R2 bucket; old snapshots roll off by the backup retention, so a deleted request can persist in older backups for that time.
4. **WhatsApp / Telegram hand-off**: the contact page also opens WhatsApp or Telegram with a pre-written message when the visitor chooses that channel; that is the visitor's own message from their own app.
5. The visitor's IP address is used in memory for rate limiting (never stored in the database) and is visible in the server's access logs of Caddy/Docker.

## 4. The AI assistant widget

Messages typed into the floating assistant are sent to whichever AI provider has a key configured (Google Gemini, Hugging Face or Anthropic, in that order of preference) to produce the answer. **Which provider is active in production is not visible from the repository**; it depends on `deploy/.env`. A notice must name it, or the widget must be switched off.

## 5. What a privacy notice needs from the owner (not invented here)

- The company's legal name and a contact address for privacy requests (access, correction, deletion).
- The retention rule for customer requests (how long they are kept; today: until manually deleted).
- Which AI provider is active (§4), and whether analytics will be turned on (§1).
- Which law and visitor regions the company wants to cover (Tajikistan, Russia, EU, others); this decides whether consent banners, data-transfer statements and similar wording are required.
- Languages: Tajik first, then Russian and English (Persian for the hidden `fa` routes); Tajik/Persian legal wording needs a native reviewer.

Until these are answered no notice page is published and no footer link is added: a page that states retention periods, legal bases or promises that are not true would be worse than none. **When the answers exist, the work is small** (one static page per house and language, a footer link, no code risk) and can be done as a separate change.
