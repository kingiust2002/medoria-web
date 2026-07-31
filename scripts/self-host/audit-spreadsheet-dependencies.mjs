import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "artifacts",
  "backups",
]);
const allowedExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
]);
const packageNames = ["exceljs", "xlsx"];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

const findings = Object.fromEntries(packageNames.map((name) => [name, []]));

for (const absolute of walk(root)) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  const text = fs.readFileSync(absolute, "utf8");

  for (const packageName of packageNames) {
    const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expressions = [
      new RegExp(`(?:from\\s*|import\\s*\\(|require\\s*\\()\\s*["'\\x60]${escaped}(?:/[^"'\\x60]*)?["'\\x60]`, "g"),
      new RegExp(`import\\s*["'\\x60]${escaped}(?:/[^"'\\x60]*)?["'\\x60]`, "g"),
    ];

    for (const expression of expressions) {
      for (const match of text.matchAll(expression)) {
        findings[packageName].push({
          file: relative,
          line: lineNumberAt(text, match.index ?? 0),
          snippet: match[0],
        });
      }
    }
  }
}

for (const values of Object.values(findings)) {
  values.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const report = {
  generatedAt: new Date().toISOString(),
  findings,
  counts: Object.fromEntries(
    Object.entries(findings).map(([name, values]) => [name, values.length])
  ),
};

const outputPath = process.argv[2];
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, serialized, { mode: 0o600 });
  console.log(`Spreadsheet dependency audit written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}

if (findings.xlsx.length === 0) {
  console.error("xlsx is declared for spreadsheet parsing but no source import was detected");
  process.exit(1);
}
