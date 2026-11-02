// Migration 53 (approved deletions that check the reviewed version and delete in one transaction) run for real on a throw-away
// PostgreSQL cluster, for both houses, with sessions that really overlap. These are the review's R3 / R9 / R10 as database behavior:
//   R3  a customer request changed after the reviewer saw it is never deleted by the approval for the old version (microsecond exact)
//   R9  a category's members are counted and moved INSIDE the database: 1500 products, no API row cap in the way
//   R10 same count, different products (or any other edit) is not "unchanged": the category / brand survives
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";
import { SCHEMA } from "./helpers/atomicDeleteSchema.mjs";

const pg = createCluster("pg53", 7500);
before(() => pg.start({ migrations: { 53: "53_atomic_approved_deletes.sql" } }));
after(() => pg.stop());

const must = (r) => pg.must(r);
const sql = (q, role = "service_role") => pg.psql(q, { role });
const val = (q, role = "service_role") => must(pg.psql(q, role));
const json = (q) => JSON.parse(val(q));
const fn = (call) => json(`SELECT ${call}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


test("the functions need the tables; after the tables exist the migration applies and re-applies", { skip: SKIP }, () => {
  must(pg.script("schema.sql", SCHEMA));
  must(pg.psql(pg.M(53), { file: true })); must(pg.psql(pg.M(53), { file: true }));
});

test("only the service role can run any of them (anon and signed-in API users cannot)", { skip: SKIP }, () => {
  for (const call of ["public.operator_delete_quotes_checked('health', ARRAY[1]::bigint[], '{}'::jsonb)", "public.operator_category_basis('health', 1)",
    "public.operator_delete_category_checked('health', 1, NULL, '{}'::jsonb)", "public.operator_delete_brand_checked(1, '{}'::jsonb)", "public.operator_brand_basis(1)"]) {
    for (const role of ["anon", "authenticated"]) {
      const r = sql(`SELECT ${call}`, role);
      assert.equal(r.ok, false, `${role} must not run ${call}`); assert.match(r.err, /permission denied/);
    }
    assert.equal(sql(`SELECT ${call}`, "service_role").ok, true, call);
  }
});

for (const house of ["health", "beauty"]) {
  const Q = house === "health" ? "quote_requests" : "beauty_quote_requests";
  const O = house === "health" ? "beauty_quote_requests" : "quote_requests";
  // evaluated NOW, as the reviewer's request would carry them (a lazily evaluated subquery would silently read the later state)
  const versions = (ids) => `'${val(`SELECT jsonb_object_agg(id::text, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00') FROM ${Q} WHERE id = ANY (ARRAY[${ids}]::bigint[])`)}'::jsonb`;
  const del = (ids, v = versions(ids)) => fn(`public.operator_delete_quotes_checked('${house}', ARRAY[${ids}]::bigint[], ${v})`);
  const seed = () => { must(pg.psql(`TRUNCATE ${Q}, ${O} RESTART IDENTITY; INSERT INTO ${Q}(name) VALUES ('a'),('b'),('c'); INSERT INTO ${O}(name) VALUES ('other house')`)); };

  test(`${house} R3: requests at the reviewed version are deleted together; the other house is untouched`, { skip: SKIP }, () => {
    seed();
    const r = del("1,2");
    assert.deepEqual([r.ok, r.deleted], [true, [1, 2]]);
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "1");
    assert.equal(val(`SELECT count(*) FROM ${O}`), "1", "the other house's table is never reached");
  });

  test(`${house} R3: ONE changed request means NOTHING is deleted (all or nothing), and a one-microsecond difference counts`, { skip: SKIP }, () => {
    seed();
    const v = versions("1,2,3");
    must(pg.psql(`UPDATE ${Q} SET status = 'answered' WHERE id = 2`));
    const r = del("1,2,3", v);
    assert.deepEqual([r.ok, r.reason, r.changed_id], [false, "stale", 2]);
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "3");
    // the same instant written differently still matches; one microsecond later does not
    const exact = versions("1,3");
    must(pg.psql(`ALTER TABLE ${Q} DISABLE TRIGGER USER; UPDATE ${Q} SET updated_at = updated_at + interval '1 microsecond' WHERE id = 3; ALTER TABLE ${Q} ENABLE TRIGGER USER`));
    assert.equal(del("1,3", exact).reason, "stale", "a different sub-millisecond version is a different version");
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "3");
    assert.equal(del("1,3").ok, true);
  });

  test(`${house} R3: a missing request, a duplicated id list and an empty list`, { skip: SKIP }, () => {
    seed();
    const v = versions("1,2");
    assert.equal(fn(`public.operator_delete_quotes_checked('${house}', ARRAY[1,2,999]::bigint[], ${v})`).reason, "stale");
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "3");
    assert.deepEqual(fn(`public.operator_delete_quotes_checked('${house}', ARRAY[1,1,2]::bigint[], ${v})`).deleted, [1, 2], "duplicates collapse");
    assert.equal(fn(`public.operator_delete_quotes_checked('${house}', ARRAY[]::bigint[], '{}'::jsonb)`).reason, "none");
    assert.equal(fn(`public.operator_delete_quotes_checked('nonsense', ARRAY[3]::bigint[], '{}'::jsonb)`).reason, "bad_house");
  });

  test(`${house} R3: an answer committed by another session while the approval waits is not deleted (real overlap)`, { skip: SKIP }, async () => {
    seed();
    const v = versions("1,2");
    // session A changes request 1 and keeps its transaction open; the approval (B) must wait for the row lock and then judge the NEW version
    const a = pg.async(`BEGIN; UPDATE ${Q} SET status = 'answered' WHERE id = 1; SELECT pg_sleep(1.2); COMMIT;`);
    await sleep(350);
    const t0 = Date.now();
    const b = await pg.async(`SELECT public.operator_delete_quotes_checked('${house}', ARRAY[1,2]::bigint[], ${v})`);
    assert.ok((await a).ok);
    assert.ok(Date.now() - t0 > 400, "the approval really waited for the other session");
    const r = JSON.parse(b.out.split("\n").pop());
    assert.deepEqual([r.ok, r.reason], [false, "stale"]);
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "3");
    assert.equal(val(`SELECT status FROM ${Q} WHERE id = 1`), "answered");
  });

  test(`${house} R3: two approvals of the same requests: exactly one deletes, the other reports stale`, { skip: SKIP }, async () => {
    seed();
    const v = versions("1,2");
    const call = `SELECT public.operator_delete_quotes_checked('${house}', ARRAY[1,2]::bigint[], ${v})`;
    const [x, y] = await Promise.all([pg.async(call), pg.async(call)]);
    const rs = [x, y].map((r) => JSON.parse(r.out.split("\n").pop()));
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(rs.filter((r) => !r.ok && r.reason === "stale").length, 1);
    assert.equal(val(`SELECT count(*) FROM ${Q}`), "1");
  });
}

for (const house of ["health", "beauty"]) {
  const C = house === "health" ? "categories" : "beauty_categories";
  const P = house === "health" ? "products" : "beauty_products";
  const reset = () => {
    must(pg.psql(`TRUNCATE ${P}, ${C} RESTART IDENTITY CASCADE`));
    must(pg.psql(`INSERT INTO ${C}(slug, name_en) VALUES ('one','One'),('two','Two'),('empty','Empty')`));
  };
  const addProducts = (n, extra = "category_id = 1") => must(pg.psql(`INSERT INTO ${P}(sku, category, category_id) SELECT 'S' || g, 'one', 1 FROM generate_series(1, ${n}) g`));
  const basis = (id) => fn(`public.operator_category_basis('${house}', ${id})`);
  const del = (id, to, b) => fn(`public.operator_delete_category_checked('${house}', ${id}, ${to ?? "NULL"}, '${JSON.stringify(b).replace(/'/g, "''")}'::jsonb)`);

  test(`${house} R9: 1500 members are counted and moved inside the database, none is left behind`, { skip: SKIP }, () => {
    reset(); addProducts(1500);
    const b = basis(1);
    assert.deepEqual([b.found, b.members, b.children], [true, 1500, 0]);
    const r = del(1, 2, b);
    assert.deepEqual([r.ok, r.moved], [true, 1500]);
    assert.equal(val(`SELECT count(*) FROM ${P} WHERE category_id = 2`), "1500");
    assert.equal(val(`SELECT count(*) FROM ${P} WHERE category_id IS NULL`), "0");
    assert.equal(val(`SELECT count(*) FROM ${P}`), "1500", "no product is ever deleted");
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "0");
    assert.equal(val(`SELECT count(DISTINCT category) FROM ${P}`), "1");
    assert.equal(val(`SELECT category FROM ${P} LIMIT 1`), "two", "the text slug follows the move");
  });

  test(`${house} R10: the same number of products but a different one in the set is stale; nothing is moved or deleted`, { skip: SKIP }, () => {
    reset(); addProducts(2);
    must(pg.psql(`INSERT INTO ${P}(sku, category, category_id) VALUES ('X', 'two', 2)`));
    const b = basis(1);
    must(pg.psql(`UPDATE ${P} SET category_id = 2, category = 'two' WHERE sku = 'S1'; UPDATE ${P} SET category_id = 1, category = 'one' WHERE sku = 'X'`));
    const now = basis(1);
    assert.equal(now.members, b.members, "the count is unchanged");
    assert.notEqual(now.members_hash, b.members_hash, "…but the set is not");
    const r = del(1, 2, b);
    assert.deepEqual([r.ok, r.reason], [false, "stale"]);
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "1");
    assert.equal(val(`SELECT count(*) FROM ${P} WHERE sku = 'X' AND category_id = 1`), "1", "the new member was not moved");
  });

  test(`${house} R10: editing a member or the category itself after the review is stale as well`, { skip: SKIP }, () => {
    reset(); addProducts(2);
    let b = basis(1);
    must(pg.psql(`UPDATE ${P} SET name_en = 'edited' WHERE sku = 'S1'`));
    assert.equal(del(1, 2, b).reason, "stale", "a member product changed");
    b = basis(1);
    must(pg.psql(`UPDATE ${C} SET name_en = 'Renamed' WHERE id = 1`));
    assert.equal(del(1, 2, b).reason, "stale", "the category row changed");
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "1");
    assert.equal(del(1, 2, basis(1)).ok, true, "against a fresh basis it goes through");
  });

  test(`${house} R10: rules inside the lock: destination required and distinct, sub-categories, missing basis, missing category`, { skip: SKIP }, () => {
    reset(); addProducts(1);
    const b = basis(1);
    assert.deepEqual([del(1, null, b).reason, del(1, 1, b).reason, del(1, 999, b).reason], ["needs_move", "same_target", "no_target"]);
    assert.equal(fn(`public.operator_delete_category_checked('${house}', 1, 2, NULL)`).reason, "no_basis");
    assert.equal(fn(`public.operator_delete_category_checked('${house}', 1, 2, '{}'::jsonb)`).reason, "no_basis");
    assert.equal(del(999, 2, b).reason, "not_found");
    assert.equal(basis(999).found, false);
    must(pg.psql(`INSERT INTO ${C}(slug, parent_id) VALUES ('kid', 3)`));
    const parent = basis(3);
    assert.equal(parent.children, 1);
    assert.equal(del(3, null, parent).reason, "has_children", "a category with sub-categories is never deleted (Beauty's parent key would cascade)");
    assert.equal(val(`SELECT count(*) FROM ${C}`), "4");
    assert.equal(val(`SELECT count(*) FROM ${P}`), "1");
  });

  test(`${house} R10: a product attached to the category while the approval runs makes it stale (real overlap)`, { skip: SKIP }, async () => {
    reset(); addProducts(2);
    const b = basis(1);
    const a = pg.async(`BEGIN; INSERT INTO ${P}(sku, category, category_id) VALUES ('LATE', 'one', 1); SELECT pg_sleep(1.2); COMMIT;`);
    await sleep(350);
    const res = await pg.async(`SELECT public.operator_delete_category_checked('${house}', 1, 2, '${JSON.stringify(b)}'::jsonb)`);
    assert.ok((await a).ok);
    const r = JSON.parse(res.out.split("\n").pop());
    assert.deepEqual([r.ok, r.reason], [false, "stale"]);
    assert.equal(val(`SELECT count(*) FROM ${C} WHERE id = 1`), "1");
    assert.equal(val(`SELECT count(*) FROM ${P} WHERE category_id = 1`), "3", "the late product stays where it is");
  });
}

test("health: the legacy slug text counts as membership and is moved too", { skip: SKIP }, () => {
  must(pg.psql("TRUNCATE products, categories RESTART IDENTITY CASCADE; INSERT INTO categories(slug) VALUES ('one'),('two'); INSERT INTO products(sku, category, category_id) VALUES ('FK', 'one', 1), ('LEGACY', 'one', NULL)"));
  const b = fn("public.operator_category_basis('health', 1)");
  assert.equal(b.members, 2);
  const r = fn(`public.operator_delete_category_checked('health', 1, 2, '${JSON.stringify(b)}'::jsonb)`);
  assert.deepEqual([r.ok, r.moved], [true, 2]);
  assert.equal(val("SELECT count(*) FROM products WHERE category_id = 2 AND category = 'two'"), "2");
});

test("a Health sub-category blocks deletion; Beauty brand: the reviewed row is deleted, an edited one survives", { skip: SKIP }, () => {
  must(pg.psql("TRUNCATE beauty_brands RESTART IDENTITY; INSERT INTO beauty_brands(slug, name) VALUES ('b1','Brand One'),('b2','Brand Two')"));
  const b1 = fn("public.operator_brand_basis(1)");
  assert.deepEqual([b1.found, b1.slug, b1.name], [true, "b1", "Brand One"]);
  must(pg.psql("UPDATE beauty_brands SET logo_url = 'products/new.webp' WHERE id = 1"));
  const stale = fn(`public.operator_delete_brand_checked(1, '${JSON.stringify(b1)}'::jsonb)`);
  assert.deepEqual([stale.ok, stale.reason], [false, "stale"]);
  assert.equal(val("SELECT count(*) FROM beauty_brands"), "2", "an edit that kept the same name and slug still protects the brand");
  assert.equal(fn("public.operator_delete_brand_checked(1, NULL)").reason, "no_basis");
  const fresh = fn("public.operator_brand_basis(1)");
  assert.equal(fn(`public.operator_delete_brand_checked(1, '${JSON.stringify(fresh)}'::jsonb)`).ok, true);
  assert.equal(fn(`public.operator_delete_brand_checked(1, '${JSON.stringify(fresh)}'::jsonb)`).reason, "not_found");
  assert.equal(fn("public.operator_brand_basis(999)").found, false);
});
