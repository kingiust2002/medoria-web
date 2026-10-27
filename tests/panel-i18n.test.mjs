// The operator panels speak Persian (the source text), Tajik and English. Keys are the Persian texts; these tests fail when
// a text is added to the code without a translation, when a translation has the wrong placeholders, or when a Persian
// text is written in the code outside t() / tr().
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tg from "../lib/panel/dict/tg.js";
import en from "../lib/panel/dict/en.js";
import { PANEL_LANGS, PANEL_LANG_META, DEFAULT_PANEL_LANG, normalizePanelLang, isPanelLang, makeT, translate, tr, formatDate, formatNumber } from "../lib/panel/i18n.js";
import { execFileSync } from "node:child_process";
import { extractAll } from "../scripts/i18n/extract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const AR = /[؀-ۿ]/, CYR = /[Ѐ-ӿ]/;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const { keys, bare } = extractAll();

test("three languages: Persian (default, right to left), Tajik and English (left to right)", () => {
  assert.deepEqual(PANEL_LANGS, ["fa", "tg", "en"]);
  assert.equal(DEFAULT_PANEL_LANG, "fa");
  assert.deepEqual(PANEL_LANGS.map((l) => PANEL_LANG_META[l].dir), ["rtl", "ltr", "ltr"]);
  assert.equal(normalizePanelLang("ru"), "fa", "Russian is not a panel language");
  assert.equal(normalizePanelLang(undefined), "fa");
  assert.equal(isPanelLang("tg"), true);
  assert.equal(isPanelLang("../../etc"), false);
});

test("every text the code uses has a Tajik and an English translation, and the dictionaries hold nothing else", () => {
  const used = [...keys.keys()];
  assert.ok(used.length > 700, `only ${used.length} keys found: the extractor is broken`);
  for (const [name, dict] of [["tg", tg], ["en", en]]) {
    const missing = used.filter((k) => typeof dict[k] !== "string" || !dict[k].trim());
    assert.deepEqual(missing.slice(0, 15), [], `${name}: ${missing.length} texts have no translation (run: node scripts/i18n/extract.mjs --missing ${name})`);
    const unused = Object.keys(dict).filter((k) => !keys.has(k));
    assert.deepEqual(unused.slice(0, 15), [], `${name}: ${unused.length} translations are not used by the code any more`);
  }
});

test("a translation keeps exactly the {placeholders} of its source text", () => {
  for (const [name, dict] of [["tg", tg], ["en", en]]) {
    for (const [k, v] of Object.entries(dict)) assert.equal(placeholders(v), placeholders(k), `${name}: "${k.slice(0, 50)}" -> "${v.slice(0, 50)}"`);
  }
});

test("Tajik is written in Cyrillic and English in Latin letters (a pasted Persian text is a mistake)", () => {
  const allowedMixed = new Set(["بله/خیر"]);   // the import accepts these Persian words: they are quoted on purpose
  for (const [k, v] of Object.entries(tg)) {
    const rest = v.replace(/[A-Za-z0-9_\-./:→←·|—–…«»“”"'()+×{}<>=$%@#&*?!,;:\s⁨⁩]/g, "");
    if (CYR.test(v) || !rest) continue;
    if (/^[\x00-\x7F\s·—–…→×+.,;:()"'|/\\\-_{}0-9A-Za-z$%]*$/.test(v)) continue;    // all Latin / technical: fine
    assert.fail(`tg: no Cyrillic in "${v}"`);
  }
  for (const [k, v] of Object.entries(en)) {
    let t = v; for (const w of allowedMixed) t = t.split(w).join("");
    assert.ok(!AR.test(t), `en contains Persian: "${v}"`);
    assert.ok(!CYR.test(v), `en contains Cyrillic: "${v}"`);
  }
  for (const [k, v] of Object.entries(tg)) assert.ok(!AR.test(v), `tg contains Persian: "${v}"`);
});

test("no Persian text is written in the code outside t() / tr(), except the named data below", () => {
  // data, not interface text: the Excel template (Persian only), words the import understands, sample values, digit tables,
  // the Persian label that sits next to its own key, and the language names in the switch
  const OK_FILES = [/^lib\/operator\/xlsxTemplate\.js$/, /^lib\/operator\/spreadsheetRows\.js$/, /^lib\/operator\/importColumns\.js$/, /^lib\/operator\/importCore\.js$/, /^lib\/operator\/completeness\.js$/, /^lib\/panel\/i18n\.js$/];
  const leftovers = bare.filter((b) => !OK_FILES.some((re) => re.test(b.file)));
  assert.deepEqual(leftovers.map((b) => `${b.file}:${b.line} ${b.text.slice(0, 50)}`), []);
  // and in those files only these kinds of text are bare
  for (const b of bare.filter((x) => OK_FILES.some((re) => re.test(x.file)))) {
    if (/importCore|importColumns/.test(b.file)) assert.ok(/دستکش|بسته|سایز|[۰-۹٠-٩]{5,}|^(بله|فعال|دارد|موجود|خیر|غیرفعال|ندارد|ناموجود)$/.test(b.text), `${b.file}:${b.line} ${b.text}`);
  }
});

test("t(): Persian is the source, a missing translation falls back to Persian, placeholders are filled", () => {
  const t = makeT("en", { "سلام {name}": "Hello {name}", "{n} مورد": "{n} items" });
  assert.equal(t("سلام {name}", { name: "Ali" }), "Hello Ali");
  assert.equal(t("چیز دیگر"), "چیز دیگر");
  assert.equal(makeT("fa", null)("سلام {name}", { name: "Ali" }), "سلام Ali");
  assert.equal(makeT("ru", { "x": "y" })("x"), "x", "an unknown language is Persian");
  assert.equal(t(undefined), undefined);
  assert.equal(translate("tg", {}, "{a}", {}), "{a}", "a missing value keeps its placeholder visible");
});

test("a message built on the server (numbers filled in) is still translated by pattern", () => {
  const msg = tr("این دسته {count} محصول دارد. دسته مقصد را انتخاب کنید.", { count: 5 });
  assert.equal(msg, "این دسته 5 محصول دارد. دسته مقصد را انتخاب کنید.");
  assert.equal(makeT("en", en)(msg), "This category has 5 products. Choose the destination category.");
  assert.match(makeT("tg", tg)(msg), /5 маҳсулот/);
  const slugMsg = tr("اسلاگ «{slug}» قبلاً وجود دارد — رد شد.", { slug: "gloves-blue" });
  assert.equal(makeT("en", en)(slugMsg), "The slug “gloves-blue” already exists — skipped.");
  assert.equal(makeT("en", en)("متنی که در فرهنگ نیست"), "متنی که در فرهنگ نیست");
});

test("every server message the clients show is a key (static ones are exact, filled-in ones match a pattern)", () => {
  const static_ = ["نشست معتبر نیست. دوباره وارد شوید.", "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).", "شناسه محصول نامعتبر است.", "وضعیت محصول در این فاصله عوض شد؛ هیچ چیز حذف نشد. صفحه را تازه کنید.", "متن تأیید درست نیست؛ هیچ چیز حذف نشد.", "فقط محصول آرشیوشده قابل حذف است. اول آن را آرشیو کنید."];
  for (const m of static_) { assert.ok(en[m], `en lacks: ${m}`); assert.ok(tg[m], `tg lacks: ${m}`); }
});

test("dates and numbers follow the language; Persian digits only for Persian", () => {
  const d = "2026-10-26T10:00:00Z";
  assert.match(formatDate("fa", d), /[۰-۹]/);
  assert.doesNotMatch(formatDate("en", d), /[۰-۹]/);
  assert.doesNotMatch(formatDate("tg", d), /[۰-۹]/);
  assert.match(formatNumber("fa", 1234), /[۰-۹]/);
  assert.equal(formatNumber("en", 1234), "1,234");
});

test("each panel area and login page is wrapped in the frame that sets language, direction and font; the switch is reachable", () => {
  assert.match(read("app/operator/layout.jsx"), /<PanelFrame>/);
  assert.match(read("app/beauty/operator/layout.jsx"), /<PanelFrame dataVertical="beauty" className="bop">/);
  for (const f of ["app/login/page.jsx", "app/login/health/page.jsx", "app/login/beauty/page.jsx"]) assert.match(read(f), /<PanelFrame>/, f);
  const frame = read("components/panel/PanelFrame.jsx");
  assert.match(frame, /dir=\{meta\.dir\}/);
  assert.match(frame, /lang=\{meta\.htmlLang\}/);
  for (const f of ["components/operator/OperatorShell.jsx", "components/beauty/operator/OperatorShell.jsx", "app/login/health/LoginForm.jsx", "app/login/beauty/LoginForm.jsx", "app/login/LoginChooser.jsx"]) assert.match(read(f), /<PanelLangSwitch/, `${f} has no language switch`);
  const act = read("lib/panel/actions.js");
  assert.match(act, /isPanelLang\(lang\)/, "the language cookie only accepts the three languages");
  assert.match(act, /sameSite: "lax"/);
});

test("no undefined variable in the panel code (`next lint` does not check this, and a missing t or lang is a crash in the browser)", () => {
  const dirs = ["components/operator", "components/beauty/operator", "components/panel", "app/operator", "app/beauty/operator", "app/login", "lib/operator", "lib/beauty/operator", "lib/panel"];
  let out = "";
  try {
    out = execFileSync(process.execPath, [path.join(root, "node_modules/eslint/bin/eslint.js"), "--no-eslintrc", "--parser-options", JSON.stringify({ ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }), "--env", "browser,node,es2022", "--rule", JSON.stringify({ "no-undef": "error" }), "--ext", ".js,.jsx", "--no-inline-config", ...dirs], { cwd: root, encoding: "utf8" });
  } catch (e) { out = String(e.stdout || e.message); }
  const bad = out.split("\n").filter((l) => /no-undef/.test(l));
  assert.deepEqual(bad, []);
});
