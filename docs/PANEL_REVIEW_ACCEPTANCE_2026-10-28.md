# Panel platform: independent re-review and acceptance — 2026-10-28

## Decision

The original R1–R8 merge hold has been lifted after code review, reproduction checks and verification of the corrected PR checks. **All 17 PRs #208–#224 were merged, in dependency order, explicitly targeting main.** Application merge checkpoint: `bd9c1749ff4c26bbce6e2da8cedeab2ed1fecbdf`. No production deployment or migration was performed by the reviewer. This is acceptance of the implemented scope, not a claim that every requested feature is built or every possible security defect has been excluded.

The reviewer pinned each merge to its reviewed head SHA; ordinary merge commits preserved previous main changes. No force push, branch deletion or unrelated PR merge was used. The resulting application tree matches the locally assembled corrected stack plus the exact-version deletion fix below. Start future work from current main, not the old feature branch heads.

| PR | Reviewed head merged |
| --- | --- |
| #208 | `87334cc55050960ddda2737364d387f4cf929d77` |
| #209 | `943a9f3b4624d21dbd69d2e750f38f742a40976d` |
| #210 | `71daaa133c5b11d1e9e17a984b72d3c62c6d1dad` |
| #211 | `050da95e5097aadea00f3b9091969513f95ced63` |
| #212 | `1e1d4a24346e61754b32905bed28a49b0abde883` |
| #213 | `c760876e6a10b3cd9745c507a7d85f212e6ffb1a` |
| #214 | `1f11e97fa19d3d64e49bc00a6b40e38b3316fd1e` |
| #215 | `68c72f33efc764616d66f85708d67909e1d9b636` |
| #216 | `3b4d57c263bc5543a816e6a414b919b8870c0e4c` |
| #217 | `0987f1033e29d93ec9214919a53fe8e8623ba9f6` |
| #218 | `729f6b5ec123382b20eaed80d8883b749b8e5dd4` |
| #219 | `2c89bb99a25f8a0d03021ab5ed941aa1358d6582` |
| #220 | `cf023281b01ca750221f8d1fbf262c61ae48e4c6` |
| #221 | `efa5fda6f06faf48c1641c20697149811c703450` |
| #222 | `19d7e20070453c466ce1771f60c821ea462dbf5e` |
| #223 | `359b09c205da7a0048e54cebaa8ad3f70a040af4` |
| #224 | `2fc3ba937ddcf84cb3156a0cd89eb4e50818d2b4` |

## What the second review established

- R1/R2: permission names and execution modes now constrain delegation and management of stronger targets. Reviewed the owning code and generated cross-house tests; limited managers cannot use the previously demonstrated account-creation/password-reset escalations.
- R3: server reads include the encrypted-seed/hash columns needed to derive safe 2FA metadata. `rowToUser` exposes enrollment/count metadata, not seeds or hashes; the unit stand-in now honors SELECT projection.
- R4: complete-list compare-and-swap uses both array containment directions, with bounded rereads. Reviewed the real concurrent PostgreSQL CI test. Independently ran the actual Supabase client against a local HTTP endpoint and verified one PATCH contains BOTH `cs.{A,B}` and `cd.{A,B}` predicates and removes A in the body. The follow-up adds that transport check as a permanent test.
- R5: self-removal of required-2FA is denied; only an owner can relax another person's requirement, with session-version consequences.
- R6: the brand query uses the real `name` column; usage errors refuse deletion; paging and pending proposal references are tested. The old promise-only review probe is not proof of a successful real scan; the permanent schema-aware tests supply that evidence.
- R7: closing is a single private transactional database function. Reviewed its count-row lock, shared line locks, snapshot check, movement posting and close. CI PostgreSQL tests cover concurrent saves/closers, rollback after a later movement fails and private execute privileges. The old review probe passes on missing RPC and must not be cited as evidence of transactional correctness.
- R8: reviewed the versioned-delete implementation and found an additional precision case; fixed as described next.

### Additional R8 correction made by the independent reviewer

`Date.parse` alone treats `2026-10-28T10:00:00.000001+00:00` and `...000002+00:00` as the same instant. The proposed fix then conditioned deletion on the freshly read timestamp, allowing a newer microsecond version to be removed.

Added a permanent failing-before-fix approval-flow test and preserved PostgreSQL's remaining fractional precision while normalizing ISO offsets. The delete's predicate remains tied to the exact fully verified row version. A second positive test verifies the same microsecond timestamp with a different ISO offset can still be deleted. Pushed ordinary commit `050da95e5097aadea00f3b9091969513f95ced63` onto owning PR #211 before merging it. Its refreshed CI passed **430 unit tests and 150 browser tests**.

## Test evidence — distinguish the environments

- Read latest check runs for all 17 reviewed PR heads: validate and browser-flows green. Read #224's original corrected-tip validate/browser logs: **573 unit tests, zero fail/skip; 198 browser tests, zero fail**.
- Ran the original independent eight probes on corrected tip `2fc3ba9`: **8 pass / 0 fail**, with the R6/R7 limitations above.
- Local focused production-module tests: **83 pass** for authorization, accounts, account actions, media and counts; **31 pass** for approvals/product deletion after the supplemental R8 fix.
- Local full unit run on combined application before the transport-test addition: **575 total, 500 pass, 1 environment failure, 74 skip**. The failure is the root/runuser/nobody backup test; PostgreSQL binaries are absent and the sandbox cannot change supplementary groups. This is NOT a fully passing local unit run. Real PostgreSQL evidence comes from the verified CI logs, not from an invented local run.
- Initial local browser attempt under Node 24: **198 total, 162 pass, 36 fail**. Do not count a successful CI run as a successful local run. A diagnostic exposed failed server replacement: npx exited, the new server reported EADDRINUSE, and the harness accepted health from the previous server. That can leave personal-account tests running with legacy settings and preserve throttles across files.
- The follow-up changes the harness to own the Next server directly, wait for that child to exit, wait for that child's ready output plus health, and reject an exited startup. It removes broad pkill commands. The new full rerun uses Node 22, matching the production/CI major version. At this document's writing that rerun and the follow-up PR checks are still in progress; their final logs/checks, not this snapshot, determine whether the follow-up is mergeable.
- The transport test uses the real installed SDK and a LOCAL HTTP server with dummy values. It does not run a real PostgREST instance. Official PostgREST documentation maps cs to @> and cd to <@, combining conditions with AND: https://docs.postgrest.org/en/v12/references/api/tables_views.html . SQL concurrency and SDK serialization were checked separately; a full PostgREST integration remains unclaimed.
- No native-speaker review, real new-user TOTP enrollment on production, new-platform Telegram delivery, external alert delivery or restore drill was performed.

## Production checkpoint supplied and checked during this conversation

The owner deployed only the earlier safe subset, before these 17 merges:

- Backup `20261028T072012Z`: local snapshot and encrypted-R2 upload/read-back verification PASS. Initial 501 upload errors were followed by successful retry and verification.
- Saved current app rollback tag `medoria-app-app:rollback-before-20261028T072012Z`; owner-supplied inspection succeeded.
- Owner's deployment output: `Deployed 5ac0592 and verified live.`, app healthy, public health/routes 200 and www redirect 308. Thus #203 and the safe deletion/i18n subset reached production.
- Owner's RLS output: **17 pass, 0 fail, 1 unknown; exit 3**. The unresolved check is public Health-product reading. Read-only SQL found Health 3 total / 0 active, Beauty 2 total / 1 active. This explains the empty Health response; it is not evidence of a successful positive public read. Do not change the checker or publish an unwanted product just to turn it green.
- Owner confirmed both quotes pages redirect to login in a fresh unauthenticated incognito window.
- Reviewer additionally made two read-only live RSC requests with the correct cookie names but invalid values. Both quotes routes returned login-redirect markers (RSC status 200); response/customer contents were not printed or saved. This checks forged-cookie denial, not every possible auth path or a real revoked production session.

No evidence of migrations 34–42, new platform secrets, publishing cron or OPERATOR_USERS activation on production has been supplied. Current proven production remains `5ac0592`, NOT the newer main application. The old §23.11 deployment-pending label is superseded only for the safe subset by this checkpoint.

## Deployment boundary and unfinished scope

**Do not run an old deploy command blindly now that main includes the platform.** The next platform release is separate: fresh verified backup and current-image rollback tag; migrations **34 → 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42** from corrected main; required secret preparation/backups; deliberate deployment and staged personal-account activation; privacy/house/role/approval/inventory/2FA/form checks; cron only when deliberately configured. Migration 41's corrected transactional version has never been applied to this production database according to the owner's evidence. Never paste secrets into chat.

The owner prefers completing the agreed code work before starting further server work. This review and these merges do not override that preference. Missing requested features remain missing: variants; true server pagination/filtering (caps are not pagination); full private/public-layout draft preview and blocking quality rules; advanced crop/focus and product documents; lots/expiry/quarantine and stock alerts; saved views/bulk-selection scope; editable contact/featured content; personal preferences/pinned shortcuts; actual restore/monitoring proof; native translation review. Chatbot and cosmetic redesign remain outside this phase.

Read the plan, author's log and release runbook together with this review. Existing Docker holds, exposed-secret/token rotation, real external alerts and the historical data-recovery gap are separate open operations items, not silently completed by the panel work.

