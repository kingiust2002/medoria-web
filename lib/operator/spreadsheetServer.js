// lib/operator/spreadsheetServer.js — SERVER ONLY
// Parse a real .xlsx / .xls workbook into the SAME { headers, rows } shape the
// CSV reader produces (lib/operator/csv.js → parseCsvWithHeader), so both file
// types feed the one import pipeline unchanged.
//
// SheetJS lives here and ONLY here. The `server-only` guard means this module
// (and the library) can never be pulled into a client bundle. Operators upload
// a workbook, we read it in memory, return plain rows, and discard the file.
import "server-only";
import * as XLSX from "xlsx";
import { IMPORT_COLUMN_KEYS } from "@/lib/operator/importCore";
import { parseSpreadsheetRows } from "@/lib/operator/spreadsheetRows";

// Read a workbook buffer → { headers, rows }.
//
// Header detection supports both:
//   1. ordinary workbooks whose machine keys are on row 1;
//   2. the official styled Medoria template whose machine keys are on row 4.
//
// The official template's example row is skipped automatically. Values are
// read as formatted text (raw:false) so numbers/dates match the CSV path;
// importCore normalizes digits, booleans, and prices downstream.
export function parseWorkbookBuffer(arrayBuffer, { maxRows = 500 } = {}) {
  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(arrayBuffer), {
      type: "array",
      cellDates: false,
    });
  } catch {
    return {
      ok: false,
      error: "خواندن فایل اکسل ناموفق بود — فایل سالم و از نوع xlsx/xls است؟",
    };
  }

  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    return { ok: false, error: "هیچ برگه‌ای (Sheet) در فایل پیدا نشد." };
  }

  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return parseSpreadsheetRows(aoa, {
    maxRows,
    allowedHeaders: IMPORT_COLUMN_KEYS,
  });
}
