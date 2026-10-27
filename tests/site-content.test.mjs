// Site content (lib/siteContent.js, lib/content/actionsCore.js): what a banner / FAQ item may contain, what the public sees of it, who may do
// what (create / edit / publish / schedule / delete are different rights), the optimistic lock, house isolation and the limit. The table and
// its public policy are proved on real PostgreSQL in site-content-migration.test.mjs.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanContent, cleanLink, CONTENT_MESSAGES, contentStatus, faqJsonLd, LIMITS, pickBanner, pickFaq, pickText } from "../lib/siteContent.js";
import * as content from "../lib/content/actionsCore.js";
import { requireAll } from "../lib/operator/access.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";

const NOW = Date.parse("2026-10-01T10:00:00.000Z");
const future = (h) => new Date(NOW + h * 3_600_000).toISOString();

test("cleanLink: a path of this site or an https address — nothing else", () => {
  for (const ok of ["", "/health/en/catalog", "/", "https://example.com/a?b=1"]) assert.equal(cleanLink(ok).ok, true, ok);
  assert.equal(cleanLink("  /x ").value, "/x");
  for (const bad of ["javascript:alert(1)", "//evil.example", "http://example.com", "https://user:pw@example.com", "/a b", "/a\\b", "data:text/html,x", "ftp://x", "https://", `/${"a".repeat(300)}`, "/<script>"]) assert.equal(cleanLink(bad).ok, false, bad);
});

test("cleanContent (banner): at least one language, trimmed, bounded, tone defaults, order is an integer", () => {
  const ok = cleanContent("banner", { text: { tg: "  Салом  ", ru: "", en: "Hello" }, label: { en: "More" }, link: "/health/en", tone: "weird", sort_order: "3", is_published: 1 }, null, NOW);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.data, { text: { tg: "Салом", en: "Hello" }, label: { en: "More" }, link: "/health/en", tone: "info" });
  assert.deepEqual([ok.value.sort_order, ok.value.is_published], [3, true]);
  assert.equal(cleanContent("banner", { text: { tg: "  " } }).error, CONTENT_MESSAGES.no_text);
  assert.equal(cleanContent("banner", { text: { tg: "x".repeat(LIMITS.bannerText + 1) } }).error, CONTENT_MESSAGES.too_long);
  assert.equal(cleanContent("banner", { text: { tg: "x" }, link: "javascript:x" }).error, CONTENT_MESSAGES.bad_link);
  assert.equal(cleanContent("banner", { text: { tg: "x" }, sort_order: "1.5" }).error, CONTENT_MESSAGES.bad_order);
  assert.equal(cleanContent("popup", {}).error, CONTENT_MESSAGES.bad_kind);
  assert.equal(cleanContent("banner", { text: { tg: `a${String.fromCharCode(0)}b${String.fromCharCode(0x2028)}c` } }, null, NOW).value.data.text.tg, "abc", "control characters and line separators are stripped");
});

test("cleanContent (faq): every question language needs its answer; the schedule is judged", () => {
  assert.equal(cleanContent("faq", { q: { tg: "Q", en: "Q2" }, a: { tg: "A" } }).error, CONTENT_MESSAGES.no_answer);
  assert.equal(cleanContent("faq", { q: {}, a: { tg: "A" } }).error, CONTENT_MESSAGES.no_text);
  const ok = cleanContent("faq", { q: { tg: "Q" }, a: { tg: "A", en: "extra answers are fine" } });
  assert.deepEqual(ok.value.data, { q: { tg: "Q" }, a: { tg: "A", en: "extra answers are fine" } });
  const input = { text: { tg: "x" }, is_published: true };
  assert.equal(cleanContent("banner", { ...input, publish_at: future(-1) }, null, NOW).ok, false, "a start in the past is refused");
  assert.equal(cleanContent("banner", { ...input, publish_at: future(5), unpublish_at: future(2) }, null, NOW).ok, false, "ends before it starts");
  const sched = cleanContent("banner", { ...input, publish_at: future(2), unpublish_at: future(5) }, null, NOW);
  assert.equal(sched.ok, true); assert.equal(sched.value.publish_at, future(2));
  const stored = { publish_at: future(-3), unpublish_at: null };
  assert.equal(cleanContent("banner", { ...input, publish_at: future(-3) }, stored, NOW).ok, true, "an unchanged past start is not judged again");
});

test("contentStatus follows the policy of migration 42", () => {
  const row = (o) => ({ is_published: true, publish_at: null, unpublish_at: null, ...o });
  assert.equal(contentStatus(row({ is_published: false }), NOW), "draft");
  assert.equal(contentStatus(row({}), NOW), "live");
  assert.equal(contentStatus(row({ publish_at: future(1) }), NOW), "scheduled");
  assert.equal(contentStatus(row({ publish_at: future(-1), unpublish_at: future(1) }), NOW), "live");
  assert.equal(contentStatus(row({ unpublish_at: future(-1) }), NOW), "ended");
  assert.equal(contentStatus(row({ unpublish_at: future(0) }), NOW), "ended", "the end instant itself is already over");
});

test("the public side: language chain, one banner, ordered FAQ, JSON-LD only for what is shown", () => {
  assert.equal(pickText({ tg: "T", en: "E" }, "ru"), "T", "Tajik first when the visitor's language has no text");
  assert.equal(pickText({ en: "E", fa: "F" }, "ru"), "E");
  assert.equal(pickText({ ru: "R" }, "ru"), "R");
  assert.equal(pickText(null, "en"), "");
  const rows = [
    { id: 1, kind: "banner", sort_order: 5, data: { text: { en: "late" } } },
    { id: 2, kind: "banner", sort_order: 1, data: { text: { en: "first old", tg: "аввал" }, link: "javascript:x", label: { en: "go" }, tone: "promo" } },
    { id: 3, kind: "banner", sort_order: 1, data: { text: { en: "first new" }, link: "/health/en", label: { en: "go" } } },
    { id: 4, kind: "faq", sort_order: 0, data: { q: { en: "?" }, a: { en: "!" } } },
  ];
  assert.deepEqual(pickBanner(rows, "en"), { id: 3, text: "first new", href: "/health/en", label: "go", tone: "info" }, "lowest order, then newest; faq rows are not banners");
  assert.equal(pickBanner([rows[1]], "tg").href, "", "an unsafe stored link is dropped at display time too");
  assert.equal(pickBanner([], "en"), null);
  const faq = pickFaq([{ id: 9, kind: "faq", sort_order: 2, data: { q: { en: "B" }, a: { en: "b" } } }, { id: 8, kind: "faq", sort_order: 1, data: { q: { en: "A" }, a: { en: "a" } } }, { id: 7, kind: "faq", sort_order: 0, data: { q: { en: "no answer" }, a: {} } }], "en");
  assert.deepEqual(faq.map((i) => i.q), ["A", "B"]);
  assert.equal(faqJsonLd([]), null);
  assert.deepEqual(faqJsonLd(faq).mainEntity[0], { "@type": "Question", name: "A", acceptedAnswer: { "@type": "Answer", text: "a" } });
});

// ── the actions ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
const boss = urow(1, { role: "house_admin" });
const drafter = urow(2, { role: "viewer", allow_perms: ["health.content.create", "health.content.edit"] });   // may write drafts, not publish / schedule / delete
const viewer = urow(3, { role: "viewer" });
let db, audits, purged, nextId;
function ctxFor(row, panel = "health") {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === row.id));
  const session = { sid: "s", uid: user.id, user, username: user.username };
  const audit = async (action, meta = {}) => { audits.push({ action, ...meta }); return { ok: true }; };
  return { admin: db, session, panel, audit, require: (ops) => requireAll({ session, panel, operations: [].concat(ops), audit }), revalidate: () => purged.push(panel) };
}
beforeEach(() => {
  invalidateSessionUser();
  audits = []; purged = []; nextId = 0;
  db = createMemoryAdmin({ operator_users: [boss, drafter, viewer], site_content: [] }, {
    defaults: { site_content: () => ({ id: ++nextId, version: 1, created_at: "2026-10-01T10:00:00.000Z", updated_at: "2026-10-01T10:00:00.000Z" }) },
    beforeUpdate: { site_content: (old, next) => { next.version = old.version + 1; return null; } },
  });
});
const soon = (h) => new Date(Date.now() + h * 3_600_000).toISOString();     // the actions judge dates against the real clock
const banner = (o = {}) => ({ text: { tg: "Салом" }, ...o });

test("a viewer can do nothing: nothing is written, nothing purged, refusals are logged", async () => {
  const c = ctxFor(viewer);
  for (const r of [await content.createContent(c, "banner", banner()), await content.updateContent(c, 1, banner(), 1), await content.deleteContent(c, 1, 1)]) { assert.equal(r.ok, false); assert.equal(r.denied, true); }
  assert.equal(db.tables.site_content.length, 0); assert.equal(purged.length, 0);
  assert.ok(audits.every((a) => a.action === "access.denied"));
});

test("an admin creates a banner and an FAQ item; the row names the person; the public pages are purged; the log has a line", async () => {
  const r = await content.createContent(ctxFor(boss), "banner", banner({ is_published: true, link: "/health/en", label: { tg: "Бештар" } }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.row.house, r.row.kind, r.row.is_published, r.row.updated_label, r.row.created_by], ["health", "banner", true, "user1", boss.id]);
  assert.equal((await content.createContent(ctxFor(boss), "faq", { q: { tg: "Q" }, a: { tg: "A" } })).ok, true);
  assert.deepEqual(purged, ["health", "health"]);
  assert.deepEqual(audits.map((a) => [a.action, a.result, a.detail.kind]), [["content.create", "success", "banner"], ["content.create", "success", "faq"]]);
  const list = await content.listContent(db, "health");
  assert.deepEqual(list.rows.map((x) => x.kind), ["banner", "faq"]);
});

test("rights are per field: a drafter saves drafts, but publishing, scheduling and deleting are refused", async () => {
  const d = ctxFor(drafter);
  const T2 = soon(2);
  const draft = await content.createContent(d, "banner", banner());
  assert.equal(draft.ok, true); assert.equal(draft.row.is_published, false);
  assert.equal((await content.createContent(d, "banner", banner({ is_published: true }))).denied, true, "creating it live needs publish");
  assert.equal((await content.createContent(d, "banner", banner({ publish_at: soon(5) }))).denied, true, "a date needs schedule");
  const edit = await content.updateContent(d, draft.row.id, banner({ text: { tg: "Нав" } }), 1);
  assert.equal(edit.ok, true); assert.equal(edit.row.data.text.tg, "Нав");
  assert.equal((await content.updateContent(d, draft.row.id, banner({ is_published: true }), 2)).denied, true, "switching it on needs publish");
  assert.equal((await content.updateContent(d, draft.row.id, banner({ unpublish_at: soon(9) }), 2)).denied, true);
  assert.equal((await content.deleteContent(d, draft.row.id, 2)).denied, true);
  assert.equal(db.tables.site_content.length, 1);
  assert.deepEqual([db.tables.site_content[0].is_published, db.tables.site_content[0].data.text.tg], [false, "Нав"]);
  // the admin can do all of it
  const a = ctxFor(boss);
  const on = await content.updateContent(a, draft.row.id, banner({ text: { tg: "Нав" }, is_published: true, publish_at: T2 }), 2);
  assert.equal(on.ok, true); assert.equal(on.row.publish_at, T2);
  assert.equal((await content.deleteContent(a, draft.row.id, on.row.version)).ok, true);
  assert.equal(db.tables.site_content.length, 0);
});

test("optimistic lock: a stale version changes nothing; a row of the other house is unknown", async () => {
  const a = ctxFor(boss);
  const r = await content.createContent(a, "banner", banner());
  assert.equal((await content.updateContent(a, r.row.id, banner({ text: { tg: "A" } }), 1)).ok, true);
  const stale = await content.updateContent(a, r.row.id, banner({ text: { tg: "B" } }), 1);
  assert.deepEqual([stale.ok, stale.stale, stale.error], [false, true, CONTENT_MESSAGES.stale]);
  assert.equal(db.tables.site_content[0].data.text.tg, "A");
  assert.equal((await content.deleteContent(a, r.row.id, 1)).stale, true);
  assert.equal(db.tables.site_content.length, 1);
  const other = urow(4, { role: "house_admin", houses: ["health", "beauty"] });
  db.tables.operator_users.push(other);
  const beauty = ctxFor(other, "beauty");
  assert.equal((await content.updateContent(beauty, r.row.id, banner(), 2)).error, CONTENT_MESSAGES.unknown, "Health's row is not Beauty's");
  assert.equal((await content.deleteContent(beauty, r.row.id, 2)).stale, true);
  assert.equal(db.tables.site_content.length, 1);
});

test("bad input is refused before any right is asked or any row written; the per-house limit holds; an unavailable table says so", async () => {
  const a = ctxFor(boss);
  assert.equal((await content.createContent(a, "banner", { text: {} })).error, CONTENT_MESSAGES.no_text);
  assert.equal((await content.createContent(a, "popup", banner())).error, CONTENT_MESSAGES.bad_kind);
  assert.equal(db.tables.site_content.length, 0);
  for (let i = 0; i < LIMITS.perHouse; i++) db.tables.site_content.push({ id: 1000 + i, house: "health", kind: "faq", version: 1 });
  assert.equal((await content.createContent(a, "faq", { q: { tg: "Q" }, a: { tg: "A" } })).error, CONTENT_MESSAGES.too_many);
  assert.equal((await content.createContent(a, "banner", banner())).ok, true, "the limit is per kind");
  db.fail = () => ({ code: "42P01", message: "relation does not exist" });
  assert.equal((await content.listContent(db, "health")).error, CONTENT_MESSAGES.unavailable);
});
