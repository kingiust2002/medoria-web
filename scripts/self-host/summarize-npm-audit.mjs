import fs from "node:fs";
import path from "node:path";

const auditPath = path.resolve(process.argv[2] || "artifacts/npm-audit.json");

if (!fs.existsSync(auditPath)) {
  console.error(`npm audit report not found: ${auditPath}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(auditPath, "utf8"));
} catch (error) {
  console.error(`invalid npm audit JSON: ${error.message}`);
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities || {};
console.log("Production dependency audit counts:", counts);

const blockingSeverities = new Set(["high", "critical"]);
const vulnerabilities = Object.entries(report.vulnerabilities || {})
  .filter(([, value]) => blockingSeverities.has(value.severity))
  .sort(([left], [right]) => left.localeCompare(right));

for (const [name, vulnerability] of vulnerabilities) {
  const via = (vulnerability.via || [])
    .map((item) => {
      if (typeof item === "string") return item;
      return [item.title, item.url, item.range].filter(Boolean).join(" | ");
    })
    .join("; ");

  console.error(
    [
      `${name}: severity=${vulnerability.severity}`,
      `direct=${Boolean(vulnerability.isDirect)}`,
      `range=${vulnerability.range || "unknown"}`,
      `fix=${JSON.stringify(vulnerability.fixAvailable)}`,
      `via=${via || "not reported"}`,
    ].join(" | ")
  );
}

if (vulnerabilities.length > 0) {
  console.error(`npm audit gate failed: ${vulnerabilities.length} high/critical package(s)`);
  process.exit(1);
}

console.log("npm audit gate passed: no high or critical production vulnerabilities");
