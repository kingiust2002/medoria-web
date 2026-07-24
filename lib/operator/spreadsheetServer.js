// lib/operator/spreadsheetServer.js — SERVER ONLY
// Parse a real .xlsx / .xls workbook into the SAME { headers, rows } shape the
// CSV reader produces (lib/operator/csv.js → parseCsvWithHeader), so both file
// types feed the one import pipeline unchanged.
//
// SheetJS lives here and ONLY here. The `server-only` guard means this module
// (and the ~600KB library) can never be pulled into a client bundle — the
// public site stays exactly as light as before. Operators upload a workbook,
// we read it in memory, hand back plain rows, and the file is discarded; it is
// never written to disk.
import "server-only";
import * as XLSX from "xlsx";

// Read a workbook buffer → { headers, rows }.
//   headers: lowercased/trimmed column names from the first row
//   rows:    objects keyed by header, every value a trimmed string
// Values are read as FORMATTED text (raw:false) so numbers/dates match what the
// CSV path delivers — importCore normalizes digits/booleans/prices downstream.
export function parseWorkbookBuffer(arrayBuffer, { maxRows = 500 } = {}) {
  let wb;
  try {
    wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: false });
  } catch {
    return { ok: false, error: "خواندن فایل اکسل ناموفق بود — فایل سالم و از نوع xlsx/xls است؟" };
  }

  const sheetName = wb.SheetNames?.[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : null;
  if (!sheet) return { ok: false, error: "هیچ برگه‌ای (Sheet) در فایل پیدا نشد." };

  // array-of-arrays: first row = header, formatted strings, blank rows dropped.
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (!aoa.length) return { ok: false, error: "برگه خالی است." };

  const headers = (aoa[0] || []).map((h) => String(h ?? "").trim().toLowerCase());
  const body = aoa.slice(1);
  const truncated = body.length > maxRows;

  const rows = body.slice(0, maxRows).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = cells[i] != null ? String(cells[i]).trim() : "";
    });
    return obj;
  }).filter((obj) => Object.values(obj).some((v) => v !== "")); // drop all-empty rows

  return { ok: true, headers, rows, truncated };
}
