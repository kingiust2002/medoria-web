#!/usr/bin/env node
// scripts/i18n/extract.mjs — lists the panel's translation keys (the first argument of t("…") / tr("…")) and every
// Persian text that is NOT inside one of those calls ("bare"). Used by tests/panel-i18n.test.mjs.
//   node scripts/i18n/extract.mjs            -> summary
//   node scripts/i18n/extract.mjs --keys     -> one key per line (sorted)
//   node scripts/i18n/extract.mjs --missing tg|en  -> keys the dictionary lacks
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { walk } from "./scan.mjs";

const AR = /[؀-ۿ]/;
export const SCOPE = ["components/operator", "components/beauty/operator", "components/panel", "app/operator", "app/beauty/operator", "app/login", "lib/operator", "lib/beauty/operator", "lib/panel"];

export function extractFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const keys = [], bare = [];
  const isCall = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ["t", "tr"].includes(n.expression.text);
  const visit = (n) => {
    if (isCall(n)) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteralLike(a)) keys.push({ text: a.text, line: sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1 });
      else if (a) {
        // t(cond ? "a" : "b") and t(x || "a"): every Persian literal inside the argument is a key
        (function inner(x) { if (ts.isStringLiteralLike(x) && AR.test(x.text)) keys.push({ text: x.text, line: sf.getLineAndCharacterOfPosition(x.getStart(sf)).line + 1 }); else ts.forEachChild(x, inner); })(a);
      }
      n.arguments.slice(1).forEach(visit);
      return;
    }
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === "k" && n.initializer && ts.isStringLiteral(n.initializer) && AR.test(n.initializer.text)
        && (ts.isJsxSelfClosingElement(n.parent.parent) || ts.isJsxOpeningElement(n.parent.parent)) && n.parent.parent.tagName.getText(sf) === "Trans") {
      keys.push({ text: n.initializer.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
      return;
    }
    if ((ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) && AR.test(n.text)) {
      bare.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: n.text.replace(/\s+/g, " ").trim() });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { keys, bare };
}

export function extractAll(roots = SCOPE, cwd = process.cwd()) {
  const keys = new Map(), bare = [];
  for (const r of roots) {
    const dir = path.join(cwd, r);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (f.includes(`${path.sep}dict${path.sep}`)) continue;
      const rel = path.relative(cwd, f);
      const res = extractFile(f);
      for (const k of res.keys) { if (!AR.test(k.text)) continue; if (!keys.has(k.text)) keys.set(k.text, []); keys.get(k.text).push(`${rel}:${k.line}`); }
      for (const b of res.bare) bare.push({ ...b, file: rel });
    }
  }
  return { keys, bare };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { keys, bare } = extractAll();
  const arg = process.argv[2];
  if (arg === "--keys") console.log([...keys.keys()].sort().join("\n"));
  else if (arg === "--missing") {
    const dict = (await import(pathToFileURL(path.resolve(`lib/panel/dict/${process.argv[3]}.js`)).href)).default;
    for (const k of [...keys.keys()].sort()) if (!dict[k]) console.log(k);
  } else {
    console.log(`${keys.size} keys, ${bare.length} bare Persian texts`);
    for (const b of bare) console.log(`${b.file}:${b.line}  ${b.text.slice(0, 80)}`);
  }
}
