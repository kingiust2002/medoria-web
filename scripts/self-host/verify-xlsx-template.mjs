import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";

const root = process.cwd();
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });

// The application is a CommonJS-package Next.js project whose source files use
// ESM syntax. Copy this pure module to .mjs for direct Node verification without
// changing the package-wide module type or invoking the Next.js compiler.
const sourcePath = path.join(root, "lib/operator/xlsxTemplate.js");
const runtimeModulePath = path.join(artifacts, "xlsxTemplate.runtime.mjs");
fs.copyFileSync(sourcePath, runtimeModulePath);

const { buildStyledTemplateXlsx } = await import(
  `${pathToFileURL(runtimeModulePath).href}?v=${Date.now()}`
);

const columns = [
  { key: "name_en", label: "نام انگلیسی *", example: "Surgical Mask", tier: "required" },
  { key: "sku", label: "کد محصول", example: "MED-0001", tier: "auto" },
  { key: "price_on_request", label: "قیمت توافقی", example: "yes", tier: "auto" },
  { key: "badge", label: "نشان", example: "NEW", tier: "optional" },
  { key: "description_en", label: "توضیحات", example: "Sample", tier: "optional" },
];

const bytes = buildStyledTemplateXlsx({
  columns,
  brand: "Medoria CI",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

assert.ok(bytes instanceof Uint8Array, "template output must be Uint8Array");
assert.equal(bytes[0], 0x50, "XLSX must start with ZIP PK signature");
assert.equal(bytes[1], 0x4b, "XLSX must start with ZIP PK signature");

const outputPath = path.join(artifacts, "verified-products-template.xlsx");
fs.writeFileSync(outputPath, bytes, { mode: 0o600 });

const workbook = XLSX.read(bytes, { type: "array", cellStyles: true });
assert.deepEqual(workbook.SheetNames, ["محصولات"]);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: false,
  defval: "",
  blankrows: false,
});

assert.equal(rows[0][0], "قالب ورود محصولات Medoria CI");
assert.equal(rows[2][0], "نام انگلیسی *");
assert.deepEqual(rows[3].slice(0, columns.length), columns.map((column) => column.key));
assert.deepEqual(rows[4].slice(0, columns.length), columns.map((column) => column.example));

const archive = unzipSync(bytes);
for (const requiredPath of [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
]) {
  assert.ok(archive[requiredPath], `missing OOXML part: ${requiredPath}`);
}

const sheetXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
const stylesXml = strFromU8(archive["xl/styles.xml"]);

assert.match(sheetXml, /rightToLeft="1"/);
assert.match(sheetXml, /state="frozen"/);
assert.match(sheetXml, /ySplit="4"/);
assert.match(sheetXml, /mergeCell ref="A1:E1"/);
assert.match(sheetXml, /mergeCell ref="A2:E2"/);
assert.match(sheetXml, /dataValidations count="2"/);
assert.match(sheetXml, /sqref="C6:C505"/);
assert.match(sheetXml, /sqref="D6:D505"/);
assert.match(stylesXml, /FFC62828/);
assert.match(stylesXml, /FF2E7D32/);
assert.match(stylesXml, /FF1565C0/);

console.log(`XLSX template verified: ${outputPath} (${bytes.length} bytes)`);
