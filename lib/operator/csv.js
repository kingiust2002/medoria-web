// lib/operator/csv.js
// Tiny dependency-free CSV reader/writer for the operator import/export tools.
// Pure functions, no node APIs — safe on both client and server.
//
// Reader handles: UTF-8 BOM, quoted fields, escaped quotes (""), newlines
// inside quotes, \r\n / \n / \r line endings, and auto-detects `,` vs `;`
// (Excel in many RU/EU locales exports with `;`).

// Detect the delimiter from the header line: whichever of , ; appears more
// often OUTSIDE quoted sections wins. Defaults to comma.
function detectDelimiter(text) {
  let inQuotes = false;
  let comma = 0;
  let semi = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break; // header line only
      if (ch === ",") comma++;
      else if (ch === ";") semi++;
    }
  }
  return semi > comma ? ";" : ",";
}

// Parse CSV text → array of rows (arrays of strings). Empty rows dropped.
export function parseCsv(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  if (!text.trim()) return [];
  const delim = detectDelimiter(text);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) pushRow();
  return rows;
}

// Parse CSV with a header row → { headers: string[], rows: object[] }.
// Header names are lowercased/trimmed; row objects are keyed by header.
export function parseCsvWithHeader(input) {
  const all = parseCsv(input);
  if (!all.length) return { headers: [], rows: [] };
  const headers = all[0].map((h) => String(h || "").trim().toLowerCase());
  const rows = all.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] != null ? String(cells[i]).trim() : ""; });
    return obj;
  });
  return { headers, rows };
}

function escapeCell(v) {
  let s = v == null ? "" : String(v);
  // Formula-injection guard: a leading = + @ or tab would execute as a formula
  // when the export is opened in Excel/Sheets. No legitimate catalog field
  // starts with these, so the apostrophe prefix is round-trip safe here.
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build CSV text from a header array + array of row arrays/objects.
// Prepends a UTF-8 BOM so Excel opens Farsi/Cyrillic text correctly.
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(",")];
  for (const r of rows) {
    const cells = Array.isArray(r) ? r : headers.map((h) => r[h]);
    lines.push(cells.map(escapeCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}
