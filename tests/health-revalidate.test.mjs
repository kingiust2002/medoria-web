// Operator edits must purge the REAL Health routes. The old code revalidated the
// pre-migration locale-first paths (/{lang}/catalog/...), which purged nothing, so
// price / spec / archive changes stayed invisible on product pages.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { healthRevalidationTargets } from "../lib/health/revalidateTargets.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("targets cover home, catalog, categories and the product page for every locale", () => {
  const t = healthRevalidationTargets(["tg", "en"], "gown");
  const paths = t.map((x) => x.path);
  for (const l of ["tg", "en"]) {
    assert.ok(paths.includes(`/health/${l}`));
    assert.ok(paths.includes(`/health/${l}/catalog`));
    assert.ok(paths.includes(`/health/${l}/categories`));
    assert.ok(paths.includes(`/health/${l}/catalog/gown`));
  }
});

test("every product page is refreshed too (renamed slug, archived product, related lists), plus the sitemap", () => {
  const t = healthRevalidationTargets(["tg"], undefined);
  assert.ok(t.some((x) => x.path === "/health/[lang]/catalog/[slug]" && x.type === "page"));
  assert.ok(t.some((x) => x.path === "/sitemap.xml"));
  assert.ok(!t.some((x) => /\/catalog\/[^[]/.test(x.path)), "no slug given: no single-product path");
});

test("no target uses the legacy locale-first shape", () => {
  for (const { path } of healthRevalidationTargets(["tg", "ru", "en", "fa"], "x")) {
    assert.ok(path.startsWith("/health/") || path === "/sitemap.xml", `unexpected path ${path}`);
  }
});

test("operator actions go through the shared helper and never revalidate legacy paths", () => {
  for (const file of ["lib/operator/actions.js", "lib/operator/importActions.js"]) {
    const src = read(file);
    assert.match(src, /revalidateHealthPublic/, `${file} must call revalidateHealthPublic`);
    assert.ok(!/revalidatePath\(\s*`\/\$\{/.test(src), `${file} still revalidates a locale-first path`);
    assert.ok(!src.includes('"/[lang]/catalog/[slug]"'), `${file} still uses the legacy product pattern`);
  }
  assert.match(read("lib/health/revalidate.js"), /healthRevalidationTargets/);
});
