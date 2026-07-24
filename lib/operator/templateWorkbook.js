// lib/operator/templateWorkbook.js — SERVER ONLY
// Build the pretty, colour-coded .xlsx import template with ExcelJS. Header
// cells are tinted by tier (red = required, green = auto-filled, blue =
// optional), columns are sized, everything is centred, yes/no + badge cells get
// dropdowns, and the sheet opens right-to-left. ExcelJS lives here only — the
// `server-only` guard keeps it out of every client bundle.
import "server-only";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS } from "@/lib/operator/importCore";

// Tier → header fill + a soft body tint for the example row.
const TIER = {
  required: { header: "FFC62828", body: "FFFBE9E9", text: "اجباری" },
  auto:     { header: "FF2E7D32", body: "FFE9F4EA", text: "خودکار" },
  optional: { header: "FF1565C0", body: "FFE9F1FB", text: "اختیاری" },
};
const YESNO = new Set(["price_on_request", "in_stock", "is_active", "is_featured"]);
const FONT = "Tahoma";
const MAX_TEMPLATE_ROWS = 500;

function widthFor(col) {
  const base = Math.max(String(col.label || "").length * 0.9, String(col.example || "").length + 2, col.key.length + 2);
  return Math.min(Math.max(base, 12), 42);
}

// Returns { base64, filename }.
export async function buildTemplateWorkbook({ brand = "Medoria" } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = brand;
  wb.created = new Date();

  const ws = wb.addWorksheet("محصولات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });

  const n = IMPORT_COLUMNS.length;
  const lastCol = ws.getColumn(n).letter;

  // Row 1 — title
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell("A1");
  title.value = `قالب ورود محصولات ${brand}`;
  title.font = { name: FONT, size: 15, bold: true, color: { argb: "FF1A1A2E" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F1EA" } };
  ws.getRow(1).height = 30;

  // Row 2 — legend
  ws.mergeCells(`A2:${lastCol}2`);
  const legend = ws.getCell("A2");
  legend.value =
    "راهنما:  🔴 قرمز = اجباری (نام را حداقل به یک زبان بنویس)   •   🟢 سبز = خودکار پر می‌شود اگر خالی بگذاری (کد محصول، اسلاگ، وضعیت‌ها و ترجمهٔ زبان‌ها)   •   🔵 آبی = اختیاری";
  legend.font = { name: FONT, size: 10, color: { argb: "FF444444" } };
  legend.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(2).height = 30;

  // Row 3 — human labels (tinted lightly per tier)
  // Row 4 — machine header keys (the row the importer actually reads)
  IMPORT_COLUMNS.forEach((col, i) => {
    const c = i + 1;
    const t = TIER[col.tier] || TIER.optional;
    ws.getColumn(c).width = widthFor(col);

    const labelCell = ws.getRow(3).getCell(c);
    labelCell.value = col.label;
    labelCell.font = { name: FONT, size: 9, color: { argb: t.header } };
    labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.body } };
    labelCell.border = thin();

    const keyCell = ws.getRow(4).getCell(c);
    keyCell.value = col.key;
    keyCell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    keyCell.alignment = { horizontal: "center", vertical: "middle" };
    keyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.header } };
    keyCell.border = thin();
  });
  ws.getRow(3).height = 42;
  ws.getRow(4).height = 22;

  // Row 5 — example row (soft-tinted per tier, so operators see the shape)
  IMPORT_COLUMNS.forEach((col, i) => {
    const t = TIER[col.tier] || TIER.optional;
    const cell = ws.getRow(5).getCell(i + 1);
    cell.value = col.example || "";
    cell.font = { name: FONT, size: 10, italic: true, color: { argb: "FF8A8A8A" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.body } };
    cell.border = thin();
  });
  ws.getRow(5).height = 20;

  // Dropdowns for yes/no + badge over the data area (rows 6..MAX+5).
  const firstData = 6;
  const lastData = firstData + MAX_TEMPLATE_ROWS - 1;
  IMPORT_COLUMNS.forEach((col, i) => {
    const letter = ws.getColumn(i + 1).letter;
    let formulae = null;
    if (YESNO.has(col.key)) formulae = ['"yes,no"'];
    else if (col.key === "badge") formulae = ['"NEW,TOP,SALE"'];
    if (!formulae) return;
    for (let r = firstData; r <= lastData; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: true, formulae, showErrorMessage: true, error: "از فهرست انتخاب کن.", errorTitle: "مقدار نامعتبر" };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "medoria";
  return {
    base64: Buffer.from(buf).toString("base64"),
    filename: `${slug}-products-template.xlsx`,
  };
}

function thin() {
  const s = { style: "thin", color: { argb: "FFDDDDDD" } };
  return { top: s, left: s, right: s, bottom: s };
}
