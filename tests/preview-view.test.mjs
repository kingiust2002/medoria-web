// The product form's "what does a visitor see in each language" preview (lib/operator/previewView.js): the public product page's own
// fallback rule (the visitor's language, else English), and that the rule really is the public page's.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PREVIEW_LANGS, isFallback, visitorView } from "../lib/operator/previewView.js";

const v = { name_tg: " Дастпӯшак ", name_en: "Gloves", name_ru: "", name_fa: "", description_en: "Nitrile gloves", description_tg: "" };

test("the visitor's language first, English otherwise, nothing when neither exists", () => {
  assert.deepEqual(visitorView(v, "tg"), { name: "Дастпӯшак", nameFrom: "tg", description: "Nitrile gloves", descriptionFrom: "en", dir: "ltr" });
  assert.deepEqual([visitorView(v, "ru").name, visitorView(v, "ru").nameFrom], ["Gloves", "en"]);
  assert.equal(visitorView({ name_tg: "x" }, "ru").name, "");
  assert.equal(visitorView({ name_tg: "x" }, "ru").nameFrom, "");
  assert.equal(visitorView({}, "fa").description, "");
  assert.equal(visitorView(null, "en").name, "");
  assert.equal(visitorView(v, "fa").dir, "rtl");
  assert.deepEqual(PREVIEW_LANGS, ["tg", "ru", "en", "fa"], "Tajik first");
});

test("isFallback: only a text that is not in the visitor's language", () => {
  assert.equal(isFallback("en", "tg"), true);
  assert.equal(isFallback("tg", "tg"), false);
  assert.equal(isFallback("", "tg"), false);
});

test("the rule is the one the public product pages use", () => {
  const health = fs.readFileSync(path.join(import.meta.dirname, "..", "app/health/[lang]/catalog/[slug]/page.jsx"), "utf8");
  assert.match(health, /product\[`name_\$\{lang\}`\] \|\| product\.name_en/);
  assert.match(health, /product\[`description_\$\{lang\}`\] \|\| product\.description_en/);
});
