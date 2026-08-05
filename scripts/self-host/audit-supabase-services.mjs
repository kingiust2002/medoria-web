import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const optionalRootFiles = ["middleware.js", "middleware.jsx", "middleware.ts", "middleware.tsx"];
const allowedExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
]);

const checks = {
  dataApi: /(?:supabase|client|admin)\s*\.\s*from\s*\(/g,
  storage: /\.storage\s*\.|storage\s*\.\s*from\s*\(/g,
  auth: /\.auth\s*\.|supabase\.auth|auth\.get(?:User|Session)|auth\.signIn/g,
  realtime: /\.channel\s*\(|\.on\s*\(\s*["']postgres_changes|removeChannel\s*\(/g,
  edgeFunctions: /\.functions\s*\.|functions\s*\.\s*invoke\s*\(/g,
  rpc: /\.rpc\s*\(/g,
  serviceRole: /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/g,
};

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;

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

const runtimeFiles = [];
for (const sourceRoot of sourceRoots) {
  walk(path.join(root, sourceRoot), runtimeFiles);
}
for (const rootFile of optionalRootFiles) {
  const absolute = path.join(root, rootFile);
  if (fs.existsSync(absolute)) runtimeFiles.push(absolute);
}

const findings = Object.fromEntries(Object.keys(checks).map((key) => [key, []]));
const bucketNames = new Set();
const rpcNames = new Set();

for (const absolute of runtimeFiles) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  const text = fs.readFileSync(absolute, "utf8");

  for (const [service, expression] of Object.entries(checks)) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      findings[service].push({
        file: relative,
        line: lineNumberAt(text, match.index ?? 0),
      });
    }
  }

  for (const match of text.matchAll(/\.storage\s*\.\s*from\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    bucketNames.add(match[1]);
  }

  for (const match of text.matchAll(/\.rpc\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    rpcNames.add(match[1]);
  }
}

for (const values of Object.values(findings)) {
  values.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const required = {
  postgres: findings.dataApi.length > 0 || findings.rpc.length > 0,
  postgrest: findings.dataApi.length > 0 || findings.rpc.length > 0,
  storage: findings.storage.length > 0 || bucketNames.size > 0,
  auth: findings.auth.length > 0,
  realtime: findings.realtime.length > 0,
  edgeFunctions: findings.edgeFunctions.length > 0,
};

const report = {
  generatedAt: new Date().toISOString(),
  scannedRuntimeFiles: runtimeFiles.length,
  required,
  detectedBucketNames: [...bucketNames].sort(),
  detectedRpcNames: [...rpcNames].sort(),
  findingCounts: Object.fromEntries(
    Object.entries(findings).map(([key, value]) => [key, value.length])
  ),
  findings,
};

const outputPath = process.argv[2];
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, serialized, { mode: 0o600 });
  console.log(`Supabase service audit written to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
