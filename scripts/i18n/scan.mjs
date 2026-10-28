// Inventory of Persian text in code positions (AST, so comments are ignored).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
const AR = /[؀-ۿ]/;
export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next"].includes(e.name)) walk(p, out); }
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
export function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const hits = [];
  const visit = (n) => {
    const k = n.kind;
    if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) { if (AR.test(n.text)) hits.push({ kind: "str", text: n.text, start: n.getStart(sf), end: n.end, parent: ts.SyntaxKind[n.parent.kind] }); }
    else if (k === ts.SyntaxKind.TemplateHead || k === ts.SyntaxKind.TemplateMiddle || k === ts.SyntaxKind.TemplateTail) { if (AR.test(n.text)) hits.push({ kind: "tpl", text: n.text, start: n.getStart(sf), end: n.end }); }
    else if (k === ts.SyntaxKind.JsxText) { if (AR.test(n.text)) hits.push({ kind: "jsx", text: n.text, start: n.getStart(sf), end: n.end }); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { src, hits };
}
if (process.argv[1] && process.argv[1].endsWith("scan.mjs")) {
  const roots = process.argv.slice(2);
  let total = 0, uniq = new Set();
  const rows = [];
  for (const r of roots) for (const f of fs.existsSync(r) && fs.statSync(r).isDirectory() ? walk(r) : [r]) {
    const { hits } = scanFile(f);
    if (hits.length) { rows.push([f, hits.length]); total += hits.length; hits.forEach((h) => uniq.add(h.text.trim())); }
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [f, n] of rows) console.log(String(n).padStart(4), f);
  console.log(`TOTAL ${total} literals, ${uniq.size} unique, ${rows.length} files`);
}
