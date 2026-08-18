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
// ESM syntax. Copy the two pure modules to .mjs for direct Node verification
// without changing the package-wide module type or invoking the Next compiler.
const templateSourcePath = path.join(root, "lib/operator/xlsxTemplate.js");
const templateRuntimePath = path.join(artifacts, "xlsxTemplate.runtime.mjs");
fs.copyFileSync(templateSourcePath, templateRuntimePath);

const rowsSourcePath = path.join(root, "lib/operator/spreadsheetRows.js");
const rowsRuntimePath = path.join(artifacts, "spreadsheetRows.runtime.mjs");
fs.copyFileSync(rowsSourcePath, rowsRuntimePath);

const { buildStyledTemplateXlsx } = await import(
  `${pathToFileURL(templateRuntimePath).href}?v=${Date.now()}`
);
const { parseSpreadsheetRows } = await import(
  `${pathToFileURL(rowsRuntimePath).href}?v=${Date.now()}`
);

const columns = [
  { key: "name_en", label: "نام انگلیسی *", example: "Surgical Mask", tier: "required" },
  { key: "sku", label: "کد محصول", example: "MED-0001", tier: "auto" },
  { key: "price_on_request", label: "قیمت توافقی", example: "yes", tier: "auto" },
  { key: "badge", label: "نشان", example: "NEW", tier: "optional" },
  { key: "description_en", label: "توضیحات", example: "Sample", tier: "optional" },
];
const allowedHeaders = columns.map((column) => column.key);

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
assert.deepEqual(rows[3].slice(0, columns.length), allowedHeaders);
assert.deepEqual(rows[4].slice(0, columns.length), columns.map((column) => column.example));

// The official template must identify row 4 as the machine-key header and must
// not import its styled example row as a real product.
const emptyTemplateParse = parseSpreadsheetRows(rows, { allowedHeaders });
assert.equal(emptyTemplateParse.ok, true);
assert.equal(emptyTemplateParse.template, true);
assert.equal(emptyTemplateParse.headerRow, 4);
assert.deepEqual(emptyTemplateParse.headers.slice(0, columns.length), allowedHeaders);
assert.deepEqual(emptyTemplateParse.rows, []);

// Simulate the operator filling the first real template row (Excel row 6).
const filledTemplateRows = rows.map((row) => [...row]);
filledTemplateRows.push([
  "Filled Product",
  "MED-1000",
  "no",
  "TOP",
  "A real product row",
]);
const filledTemplateParse = parseSpreadsheetRows(filledTemplateRows, {
  allowedHeaders,
});
assert.equal(filledTemplateParse.ok, true);
assert.equal(filledTemplateParse.template, true);
assert.deepEqual(filledTemplateParse.rows, [
  {
    name_en: "Filled Product",
    sku: "MED-1000",
    price_on_request: "no",
    badge: "TOP",
    description_en: "A real product row",
  },
]);

// Ordinary workbooks with headers on row 1 must retain the existing behavior.
const ordinaryParse = parseSpreadsheetRows(
  [
    allowedHeaders,
    ["Ordinary Product", "MED-2000", "yes", "NEW", "Plain workbook"],
  ],
  { allowedHeaders }
);
assert.equal(ordinaryParse.ok, true);
assert.equal(ordinaryParse.template, false);
assert.equal(ordinaryParse.headerRow, 1);
assert.deepEqual(ordinaryParse.rows, [
  {
    name_en: "Ordinary Product",
    sku: "MED-2000",
    price_on_request: "yes",
    badge: "NEW",
    description_en: "Plain workbook",
  },
]);

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

console.log(`XLSX template and import parser verified: ${outputPath} (${bytes.length} bytes)`);
