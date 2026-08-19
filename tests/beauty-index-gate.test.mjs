import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The gate decides whether an entire vertical is visible to search engines, so
// the parts that are easy to get wrong later are pinned here: that every
// Beauty page defers to the one helper instead of declaring robots itself
// (which is how the surface drifted half-open in the first place), and that
// the sitemap is driven by the same condition as the robots tag.

const BEAUTY_PAGES = [
  "app/beauty/[lang]/page.jsx",
  "app/beauty/[lang]/worlds/page.jsx",
  "app/beauty/[lang]/catalog/page.jsx",
  "app/beauty/[lang]/catalog/[slug]/page.jsx",
  "app/beauty/[lang]/about/page.jsx",
  "app/beauty/[lang]/contact/page.jsx",
  "app/beauty/[lang]/brands/page.jsx",
];

test("every Beauty page gets robots from the shared gate, none hardcodes it", async () => {
  for (const path of BEAUTY_PAGES) {
    const src = await readFile(path, "utf8");
    assert.match(src, /robots:\s*await beautyRobots\(lang\)/, `${path} should call beautyRobots`);
    assert.match(src, /from "@\/lib\/beauty\/seo"/, `${path} should import the gate`);
    // A literal index:false/true would silently win over the gate.
    assert.doesNotMatch(
      src,
      /robots:\s*(\{|lang\s*===)/,
      `${path} still declares robots inline — the gate is the only place that decides`,
    );
  }
});

test("the gate keeps Farsi closed and fails closed", async () => {
  const src = await readFile("lib/beauty/seo.js", "utf8");
  assert.match(src, /HIDDEN_LOCALE\s*=\s*"fa"/);
  assert.match(src, /if \(lang === HIDDEN_LOCALE\) return false/);
  // The catch must return false: a database hiccup must not publish the
  // pre-launch catalog by accident.
  assert.match(src, /catch\s*\{[\s\S]*?return false;[\s\S]*?\}/);
});

test("the sitemap lists Beauty only under the same condition as the robots tag", async () => {
  const src = await readFile("app/sitemap.js", "utf8");
  assert.match(src, /import \{ isBeautyIndexable \} from "@\/lib\/beauty\/seo"/);
  assert.match(src, /if \(await isBeautyIndexable\(/);
  // Every Beauty URL must be *emitted* inside that guard. Checking the first
  // mention of BEAUTY would be wrong — beautyLangMap legitimately references
  // it while being defined above the guard — so look at the push sites only.
  const guardAt = src.indexOf("if (await isBeautyIndexable(");
  assert.ok(guardAt !== -1, "no indexable guard in the sitemap");
  const pushes = [...src.matchAll(/out\.push\(\{[\s\S]*?\n\s*\}\);/g)];
  const beautyPushes = pushes.filter((m) => m[0].includes("${BEAUTY}"));
  assert.ok(beautyPushes.length > 0, "the sitemap never emits a Beauty URL");
  for (const m of beautyPushes) {
    assert.ok(m.index > guardAt,
      "a Beauty URL is pushed outside the indexable guard");
  }
});

test("the product count that drives the gate is cached under a tag the panel busts", async () => {
  const catalog = await readFile("lib/beauty/catalog.js", "utf8");
  assert.match(catalog, /\["beauty-product-count"\]/);
  assert.match(catalog, /tags:\s*\["beauty-products"\]/);
  // head:true keeps it a count, not a full table read, since it runs in every
  // Beauty page's generateMetadata.
  assert.match(catalog, /count:\s*"exact",\s*head:\s*true/);

  const actions = await readFile("lib/beauty/operator/actions.js", "utf8");
  assert.match(actions, /revalidateTag\("beauty-products"\)/,
    "operator saves must bust the count, or the gate lags behind the catalog");
});
