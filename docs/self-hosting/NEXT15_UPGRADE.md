# Next.js 15 maintenance upgrade

> **Historical — migration-era document.**
>
> This file describes the plan and validation work carried out *before* the
> August 2026 cutover, when production was still Vercel + Supabase Cloud. The
> migration is complete: production is the self-hosted VPS behind
> `https://medoriaco.com`. Keep this file for the reasoning and the test
> evidence it records, not as instructions to follow.
>
> The authoritative operational document is
> [`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md`](../PRODUCTION_MIGRATION_AND_OPERATIONS.md).
> The branches this document may name — `infra/self-hosting` and
> `upgrade/next15-self-hosting` — were closed without merge and deleted; their
> content lives on in this branch's history (runbook §1).

Status when written: isolated draft branch only, targeting `infra/self-hosting`, not `main`, and not approved for production.

Status now: **superseded.** That draft branch (`upgrade/next15-self-hosting`, PR #117) and its base (`infra/self-hosting`, PR #116) were both closed without merge on 2026-08-10 and deleted. The upgrade work described below is already part of `staging/self-hosting-sync-20260802`, which is what production runs. The sections that follow are kept for the reasoning and the validation evidence.

## Why this upgrade exists

The self-hosted infrastructure work originally inherited Next.js `14.2.35`. Next.js 14 is outside the supported production line, so moving the site away from Vercel while retaining an end-of-life framework would replace one operational risk with a security-maintenance risk.

This branch moves the application to the patched Next.js 15 maintenance line and validates the resulting standalone container before any VPS or production deployment.

Official references:

- https://nextjs.org/support-policy
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://nextjs.org/blog

## Locked framework versions

- Next.js `15.5.21`
- React `19.2.8`
- React DOM `19.2.8`
- eslint-config-next `15.5.21`
- Node.js container runtime `22.23.1`

Versions are exact in `package.json` and `package-lock.json`.

## Compatibility migrations

### Async request APIs

The official Next.js codemod migrated asynchronous request APIs throughout the runtime source:

- route/page `params`;
- page `searchParams`;
- `cookies()`;
- `headers()`.

The Health and Beauty operator authentication helpers now await the cookie store explicitly. Login, logout, CAPTCHA, quote, product, category, comparison, wishlist, and world routes were manually reviewed after the codemod.

### Stable server external packages configuration

The deprecated experimental external-package option was replaced with `serverExternalPackages`.

Only `xlsx` remains external because it is a server-only workbook parser. ExcelJS was removed.

### Public data-cache semantics

Next.js 15 changed unconfigured server fetches to uncached behavior. Supabase JS uses `fetch` internally, so public catalog reads would otherwise bypass the previous ISR/Data Cache behavior and query Supabase on every request.

The public locale layouts now set:

```js
export const fetchCache = "default-cache";
```

This is deliberately scoped to:

- `app/health/[lang]/layout.jsx`;
- `app/beauty/[lang]/layout.jsx`.

Operator routes and API routes remain outside those layouts and do not inherit public read caching. Existing static `revalidate` values and operator-side `revalidatePath` calls continue to control freshness.

## Dependency security cleanup

A production-only npm audit initially found high-severity dependency paths.

Resolved changes:

- `sharp` updated and globally overridden to `0.35.3` so Next.js and the application resolve the patched release;
- PostCSS pinned and overridden to `8.5.18`;
- ExcelJS removed with its vulnerable archive/glob/minimatch chain;
- `fflate@0.8.3` added for dependency-light OOXML generation;
- current production dependency audit returns zero vulnerabilities.

The audit remains a blocking CI gate. It is not bypassed with `--force` or a lower severity threshold.

## Spreadsheet template replacement

ExcelJS was used only to generate the styled import template. It was replaced with a small standards-based OOXML generator that preserves:

- RTL worksheet layout;
- frozen instruction/header rows;
- merged title and legend rows;
- required/automatic/optional colour tiers;
- calculated column widths;
- example values;
- yes/no and badge dropdown validations.

CI validates the generated archive, opens it with the existing SheetJS parser, verifies OOXML parts and styles, and uploads the generated workbook as an artifact.

During this work, an existing import defect was found: the parser treated row 1 of the styled template as the machine header, although the real key row is row 4 and row 5 is documentation/example data. The parser now:

- locates the strongest recognized machine-key row in the first 20 rows;
- recognizes the official Medoria template by its title and header coverage;
- skips the official example row;
- preserves ordinary row-1 workbook behavior;
- reports the detected header row and template mode.

CI tests both official-template and ordinary-workbook paths.

## CI gates

The upgrade branch blocks on:

- locked dependency installation;
- spreadsheet dependency usage audit;
- generated XLSX structural/parser verification;
- production npm vulnerability audit;
- lint and unit tests;
- JavaScript and shell syntax;
- migration destructive-operation guards;
- Supabase runtime service inventory;
- environment contract validation;
- standalone Next.js production build;
- Compose rendering;
- Caddy configuration validation;
- production Docker image build;
- Trivy HIGH/CRITICAL fixed-vulnerability scan;
- `sharp` runtime loading;
- live container health, gateway, login, security-header, and redirect smoke tests.

## Remaining real-world tests

Automated CI cannot prove browser hydration, external Supabase connectivity, secure cookies through the actual TLS proxy, operator workflows, image transformations against real stored images, or ISR persistence on the VPS.

Before this branch can leave draft status:

1. deploy it to the isolated application staging VPS;
2. use the current Supabase Cloud project;
3. test all public locales and both operator panels;
4. download and re-upload the generated template through the real operator workflow;
5. verify writes and revalidation;
6. observe the deployment for at least 48 hours;
7. keep Vercel production unchanged throughout.

## Rollback

Historical: at the time, this branch was not merged into `infra/self-hosting`, so the immediate code rollback was simply to keep using that branch.

Neither branch exists any more, so that rollback path is gone. The current rollback model — which accounts for the production data written on the VPS after cutover — is in [`docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md`](../PRODUCTION_MIGRATION_AND_OPERATIONS.md) §8. Vercel is no longer a rollback target for the application.
