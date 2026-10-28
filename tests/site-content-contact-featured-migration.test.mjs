// Migration 51 (contact details and featured products as site content) run for real on a throw-away PostgreSQL cluster (skipped where the server
// binaries are not installed). Proves: it needs migration 42; it is idempotent; the two new kinds are accepted and others still refused; one contact row
// per house and one featured row per product and house; the shape checks (phone, WhatsApp, Telegram, e-mail, unknown keys, product id); the public
// still sees only LIVE rows and only the public columns of the new kinds; nobody but service_role writes.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg51", 7730);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 42: "42_site_content.sql", 51: "51_site_content_contact_featured.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const row = (house, kind, data, extra = "TRUE") => `INSERT INTO site_content(house, kind, data, is_published) VALUES ('${house}', '${kind}', '${JSON.stringify(data)}'::jsonb, ${extra})`;

test("needs migration 42 and is idempotent", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true })); must(psql(pg.M(42), { file: true }));
  must(psql(pg.M(51), { file: true })); must(psql(pg.M(51), { file: true }));
  assert.equal(must(psql("SELECT count(*) FROM site_content")), "0");
});

test("the kinds: banner, faq, contact and featured — nothing else", { skip: SKIP }, () => {
  must(sc(row("health", "banner", { text: { en: "x" }, tone: "info" })));
  assert.equal(sc(row("health", "poster", { x: 1 })).ok, false);
});

test("one contact row per house", { skip: SKIP }, () => {
  must(sc(row("health", "contact", { phone: "+992900111222", whatsapp: "992900111222", telegram: "medoria_health", email: "health@example.com" })));
  assert.equal(sc(row("health", "contact", { phone: "+992900111223" })).ok, false, "a second contact row in the same house");
  must(sc(row("beauty", "contact", { email: "beauty@example.com" })));
});

test("contact shapes: only plain values and only the four keys", { skip: SKIP }, () => {
  const bad = (data) => sc(`UPDATE site_content SET data = '${JSON.stringify(data)}'::jsonb WHERE kind = 'contact' AND house = 'beauty'`).ok;
  assert.equal(bad({}), false, "empty");
  assert.equal(bad({ phone: "992900111222" }), false, "a phone number needs its +");
  assert.equal(bad({ phone: "+99 29" }), false);
  assert.equal(bad({ whatsapp: "+992900111222" }), false, "WhatsApp is digits only");
  assert.equal(bad({ telegram: "ab" }), false, "too short");
  assert.equal(bad({ telegram: "@medoria_tj" }), false, "no @");
  assert.equal(bad({ email: "not an email" }), false);
  assert.equal(bad({ email: "a@b" }), false);
  assert.equal(bad({ email: "a@b.com", website: "https://x" }), false, "an unknown key");
  assert.equal(bad({ phone: 123 }), false, "a number instead of text");
  assert.equal(bad({ email: `${"a".repeat(120)}@x.com` }), false, "too long");
  assert.equal(bad({ phone: "+992900111222", whatsapp: "992900111222", telegram: "Medoria_Beauty", email: "ok@example.org" }), true);
});

test("featured: one row per product and house, a plain product id only", { skip: SKIP }, () => {
  must(sc(row("health", "featured", { product_id: 5 })));
  assert.equal(sc(row("health", "featured", { product_id: 5 })).ok, false, "the same product twice in a house");
  must(sc(row("beauty", "featured", { product_id: 5 })));
  must(sc(row("health", "featured", { product_id: 6 })));
  for (const data of [{ product_id: "5" }, { product_id: 0 }, { product_id: -3 }, { product_id: 1.5 }, { product_id: 7, extra: 1 }, {}]) {
    assert.equal(sc(row("health", "featured", data)).ok, false, JSON.stringify(data));
  }
});

test("the public sees only live rows of the new kinds, public columns only; nobody but service_role writes", { skip: SKIP }, () => {
  must(sc(row("health", "featured", { product_id: 9 }, "FALSE")));                 // a draft
  assert.equal(must(psql("SELECT count(*) FROM site_content WHERE kind IN ('contact','featured')", { role: "anon" })), "5", "contact x2 and featured x3 are live; the draft is not");
  assert.equal(psql("SELECT updated_label FROM site_content", { role: "anon" }).ok, false);
  assert.equal(psql("SELECT is_published FROM site_content", { role: "anon" }).ok, false);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql(row("health", "featured", { product_id: 99 }), { role }).ok, false, `${role} must not insert`);
    assert.equal(psql("UPDATE site_content SET data = '{}'::jsonb WHERE kind = 'contact'", { role }).ok, false, `${role} must not update`);
  }
});

test("house and kind never change", { skip: SKIP }, () => {
  assert.equal(sc("UPDATE site_content SET kind = 'featured' WHERE kind = 'contact' AND house = 'health'").ok, false);
  assert.equal(sc("UPDATE site_content SET house = 'beauty' WHERE kind = 'featured' AND house = 'health' AND (data->>'product_id')::int = 6").ok, false);
});
