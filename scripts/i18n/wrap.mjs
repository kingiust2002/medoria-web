#!/usr/bin/env node
// scripts/i18n/wrap.mjs — one-off codemod used to introduce the panel i18n: wraps every Persian text in code positions
// with t("…") (inside components) or tr("…") (module level), merges "text {expr} text" runs of JSX into one message with
// {placeholders}, and adds the useT()/getT() line and the import. Anything it is not sure about is REPORTED, not changed.
//   node scripts/i18n/wrap.mjs <files or dirs…> [--dry]
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { walk } from "./scan.mjs";

const AR = /[؀-ۿ]/;
const LOGIC_METHODS = new Set(["includes", "split", "startsWith", "endsWith", "replace", "replaceAll", "match", "indexOf", "lastIndexOf", "localeCompare", "test", "search", "normalize", "matchAll", "has", "get", "add"]);
const dry = process.argv.includes("--dry");
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = targets.flatMap((t) => (fs.statSync(t).isDirectory() ? walk(t) : [t])).filter((f) => /\.jsx?$/.test(f));

// JSX whitespace rules for one text node
function jsxNormalize(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const out = [];
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, " ");
    if (i !== 0) l = l.replace(/^ +/, "");
    if (i !== lines.length - 1) l = l.replace(/ +$/, "");
    if (l) out.push(l);
  });
  return out.join(" ");
}

const report = [];
let changedFiles = 0, wrapped = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!AR.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const isClient = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use client["']/.test(src);
  const isServerActions = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use server["']/.test(src);
  const note = (kind, node, extra = "") => { const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf)); report.push(`${kind.padEnd(8)} ${file}:${line + 1} ${extra}`.trimEnd()); };

  // a local variable/parameter called `t` would shadow the translate function
  let shadows = false;
  (function find(n) {
    if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === "t") shadows = true;
    ts.forEachChild(n, find);
  })(sf);
  if (shadows) { report.push(`SHADOW   ${file}: a local named t exists - fix by hand`); continue; }

  // top-level components
  const comps = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const isDefault = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const name = st.name?.text || "";
      if (isDefault || /^[A-Z]/.test(name)) comps.push({ node: st, body: st.body, name: name || "default", async: Boolean(st.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          if (ts.isBlock(init.body)) comps.push({ node: st, body: init.body, name: d.name.text, async: Boolean(init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) });
          else report.push(`EXPRBODY ${file}: component ${d.name.text} has an expression body - fix by hand`);
        }
      }
    }
  }
  const compOf = (pos) => comps.find((c) => pos >= c.node.getStart(sf) && pos < c.node.end) || null;

  const edits = [];          // { start, end, text }
  const usedBy = new Set();  // components that now call t()
  let usesTr = false;

  const keyNameOf = (expr, used) => {
    let base = "v";
    let e = expr;
    while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression?.(e)) e = e.expression;
    if (ts.isIdentifier(e)) base = e.text;
    else if (ts.isPropertyAccessExpression(e)) base = e.name.text;
    else if (ts.isCallExpression(e)) { const c = e.expression; base = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "v"; }
    else if (ts.isElementAccessExpression(e) && ts.isPropertyAccessExpression(e.expression)) base = e.expression.name.text;
    base = base.replace(/[^\w]/g, "") || "v";
    if (/^\d/.test(base)) base = "v" + base;
    let name = base, i = 2;
    while (used.has(name)) name = base + i++;
    used.add(name);
    return name;
  };
  const hasArabicOrJsx = (n) => { let r = false; (function v(x) { if (r) return; if ((ts.isStringLiteralLike(x) && AR.test(x.text)) || ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x) || (ts.isTemplateHead(x) && AR.test(x.text)) || (ts.isTemplateMiddle(x) && AR.test(x.text)) || (ts.isTemplateTail(x) && AR.test(x.text))) { r = true; return; } ts.forEachChild(x, v); })(n); return r; };

  const callT = (comp, key, vars) => {
    if (comp) { usedBy.add(comp); const v = vars && vars.length ? `, { ${vars.map(([k, e]) => (k === e ? k : `${k}: ${e}`)).join(", ")} }` : ""; return `t(${JSON.stringify(key)}${v})`; }
    usesTr = true;
    return `tr(${JSON.stringify(key)})`;
  };

  function handleChildren(children) {
    let i = 0;
    while (i < children.length) {
      const c = children[i];
      const mergeable = (x) => ts.isJsxText(x) || (ts.isJsxExpression(x) && x.expression && !hasArabicOrJsx(x.expression) && !x.dotDotDotToken);
      if (!mergeable(c)) { visit(c); i++; continue; }
      let j = i;
      while (j < children.length && mergeable(children[j])) j++;
      const run = children.slice(i, j);
      const hasText = run.some((x) => ts.isJsxText(x) && AR.test(x.text));
      if (!hasText) { i = j; continue; }
      const used = new Set(); const vars = []; let key = "";
      for (const x of run) {
        if (ts.isJsxText(x)) key += jsxNormalize(x.text);
        else { const nm = keyNameOf(x.expression, used); vars.push([nm, src.slice(x.expression.getStart(sf), x.expression.end)]); key += `{${nm}}`; }
      }
      const lead = /^\s/.test(key) ? " " : "", trail = /\s$/.test(key) ? " " : "";
      const clean = key.replace(/\s+/g, " ").trim();
      const comp = compOf(run[0].pos);
      if (!comp) { note("MODLEVEL", run[0], "JSX text outside a component"); i = j; continue; }
      edits.push({ start: run[0].pos, end: run[run.length - 1].end, text: `${lead}{${callT(comp, clean, vars)}}${trail}` });
      wrapped++;
      i = j;
    }
  }

  function visit(n) {
    if (ts.isJsxElement(n)) { visit(n.openingElement); handleChildren(n.children); return; }
    if (ts.isJsxFragment(n)) { handleChildren(n.children); return; }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ["t", "tr"].includes(n.expression.text)) return;   // already wrapped

    // attribute with a plain string
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && AR.test(n.initializer.text)) {
      const comp = compOf(n.getStart(sf));
      if (!comp) { note("MODLEVEL", n, "attribute outside a component"); return; }
      edits.push({ start: n.initializer.getStart(sf), end: n.initializer.end, text: `{${callT(comp, n.initializer.text.replace(/\s+/g, " ").trim(), null)}}` });
      wrapped++;
      return;
    }
    if (ts.isStringLiteralLike(n) && AR.test(n.text)) {
      const p = n.parent;
      if (ts.isPropertyAssignment(p) && p.name === n) { note("KEY", n, JSON.stringify(n.text).slice(0, 50)); return; }
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return;
      if (ts.isJsxAttribute(p)) return;
      if (ts.isBinaryExpression(p) && ["===", "!==", "==", "!="].includes(p.operatorToken.getText(sf))) { note("LOGIC", n, JSON.stringify(n.text).slice(0, 50)); return; }
      if (ts.isCaseClause(p)) { note("LOGIC", n, JSON.stringify(n.text).slice(0, 50)); return; }
      if (ts.isCallExpression(p) && p.arguments.includes(n) && ((ts.isPropertyAccessExpression(p.expression) && LOGIC_METHODS.has(p.expression.name.text)) || (ts.isIdentifier(p.expression) && p.expression.text === "RegExp"))) { note("LOGIC", n, JSON.stringify(n.text).slice(0, 50)); return; }
      if (ts.isNewExpression(p)) { note("LOGIC", n, JSON.stringify(n.text).slice(0, 50)); return; }
      const comp = compOf(n.getStart(sf));
      const text = n.text;
      const k = comp ? "t" : "tr";
      if (!comp && isServerActions) { note("SERVER", n, JSON.stringify(text).slice(0, 60)); }
      edits.push({ start: n.getStart(sf), end: n.end, text: callT(comp, text, null) });
      if (!comp) note("TR", n, JSON.stringify(text).slice(0, 50));
      wrapped++;
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const pieces = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      if (pieces.some((s) => AR.test(s))) {
        const comp = compOf(n.getStart(sf));
        const p = n.parent;
        if (ts.isCallExpression(p) && p.arguments.includes(n) && ts.isPropertyAccessExpression(p.expression) && LOGIC_METHODS.has(p.expression.name.text)) { note("LOGIC", n, "template"); return; }
        if (!comp) { note("MANUAL", n, "template outside a component: " + JSON.stringify(pieces.join("{}")).slice(0, 60)); return; }
        const used = new Set(); const vars = []; let key = n.head.text;
        for (const s of n.templateSpans) { const nm = keyNameOf(s.expression, used); vars.push([nm, src.slice(s.expression.getStart(sf), s.expression.end)]); key += `{${nm}}` + s.literal.text; }
        edits.push({ start: n.getStart(sf), end: n.end, text: callT(comp, key, vars) });
        wrapped++;
        return;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);

  if (!edits.length) continue;

  // hooks
  const hookEdits = [];
  for (const c of usedBy) {
    const body = c.body;
    if (isClient) hookEdits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: "\n  const t = useT();" });
    else if (c.async) hookEdits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: "\n  const t = await getT();" });
    else report.push(`SYNCSRV  ${file}: component ${c.name} is a synchronous function in a server file - give it t by hand`);
  }
  // imports
  const lastImport = [...sf.statements].filter(ts.isImportDeclaration).pop();
  const at = lastImport ? lastImport.end : 0;
  const imps = [];
  const relImport = file.startsWith("lib/") ? path.relative(path.dirname(file), "lib/panel/i18n.js").replace(/\\/g, "/") : "@/lib/panel/i18n";
  if (usedBy.size) imps.push(isClient ? 'import { useT } from "@/components/panel/PanelI18n";' : 'import { getT } from "@/lib/panel/server";');
  if (usesTr) imps.push(`import { tr } from "${relImport.startsWith(".") ? relImport : "./" + relImport}";`.replace('"@/lib/panel/i18n"', '"@/lib/panel/i18n"'));
  hookEdits.push({ start: at, end: at, text: (lastImport ? "\n" : "\n") + imps.join("\n") + (lastImport ? "" : "\n") });

  const all = [...edits, ...hookEdits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  for (const e of all) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  changedFiles++;
  if (!dry) fs.writeFileSync(file, out);
}

console.log(report.join("\n"));
console.log(`\n${dry ? "[dry] " : ""}${changedFiles} files changed, ${wrapped} texts wrapped`);
