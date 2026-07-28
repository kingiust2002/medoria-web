// lib/operator/templateWorkbook.js — SERVER ONLY
// Build the styled .xlsx import template through a small OOXML generator. This
// preserves RTL layout, frozen instruction rows, tier colours, column widths,
// example values, and data-validation dropdowns without ExcelJS's vulnerable
// archive dependency chain.
import "server-only";
import { IMPORT_COLUMNS } from "@/lib/operator/importCore";
import { buildStyledTemplateXlsx } from "@/lib/operator/xlsxTemplate";

// Returns { base64, filename }.
export async function buildTemplateWorkbook({ brand = "Medoria" } = {}) {
  const bytes = buildStyledTemplateXlsx({ columns: IMPORT_COLUMNS, brand });
  const slug = brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "medoria";

  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: `${slug}-products-template.xlsx`,
  };
}
