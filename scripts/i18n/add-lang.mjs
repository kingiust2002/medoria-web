// One-off helper: in every component that uses `lang` but does not define it, add `const { lang } = usePanelLang();` after useT().
import ts from "typescript";
import fs from "node:fs";
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const edits = [];
  const comps = [];
  (function walk(n) {
    if ((ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text)) || (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))) {
      const fn = ts.isFunctionDeclaration(n) ? n : n.initializer;
      if (fn.body && ts.isBlock(fn.body)) comps.push(fn.body);
    }
    ts.forEachChild(n, walk);
  })(sf);
  for (const body of comps) {
    const text = body.getText(sf);
    if (!/\blang\b/.test(text)) continue;
    if (/const \{[^}]*\blang\b[^}]*\} = usePanelLang\(\)/.test(text) || /\(\{[^)]*\blang\b[^)]*\}\)/.test(src.slice(body.pos - 200, body.pos))) continue;
    const m = /const t = useT\(\);/.exec(text);
    if (!m) { console.log("no useT in a component using lang:", file); continue; }
    const at = body.getStart(sf) + m.index + m[0].length;
    edits.push({ at, text: "\n  const { lang } = usePanelLang();" });
  }
  if (!edits.length) continue;
  edits.sort((a, b) => b.at - a.at).forEach((e) => { src = src.slice(0, e.at) + e.text + src.slice(e.at); });
  if (!/usePanelLang\b/.test(src.split("export default")[0].split("\n").filter((l) => l.startsWith("import")).join("\n"))) {
    src = src.replace(/import \{ useT \} from "@\/components\/panel\/PanelI18n";/, 'import { useT, usePanelLang } from "@/components/panel/PanelI18n";');
  } else if (/import \{ useT \} from/.test(src)) {
    src = src.replace(/import \{ useT \} from "@\/components\/panel\/PanelI18n";/, 'import { useT, usePanelLang } from "@/components/panel/PanelI18n";');
  }
  fs.writeFileSync(file, src);
  console.log("lang added:", file, edits.length);
}
