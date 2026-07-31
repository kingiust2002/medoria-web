// lib/operator/spreadsheetRows.js
// Pure array-of-arrays parsing shared by the server workbook reader and direct
// verification scripts. No Next.js, filesystem, or database dependencies.

const TEMPLATE_TITLE_PREFIX = "قالب ورود محصولات";
const MIN_RECOGNIZED_HEADERS = 2;

function normalizedCell(value) {
  return String(value ?? "").trim().toLowerCase();
}

function recognizedHeaderCount(row, allowedHeaders) {
  const allowed = new Set(allowedHeaders);
  return (row || []).reduce(
    (count, value) => count + (allowed.has(normalizedCell(value)) ? 1 : 0),
    0
  );
}

function findHeaderRow(aoa, allowedHeaders) {
  const scanLimit = Math.min(aoa.length, 20);
  let best = { index: -1, count: 0 };

  for (let index = 0; index < scanLimit; index += 1) {
    const count = recognizedHeaderCount(aoa[index], allowedHeaders);
    if (count > best.count) best = { index, count };
  }

  if (best.count < MIN_RECOGNIZED_HEADERS) return null;
  return best;
}

function isMedoriaTemplate(aoa, headerIndex, recognizedCount, allowedHeaders) {
  const title = String(aoa?.[0]?.[0] ?? "").trim();
  const requiredCoverage = Math.max(
    MIN_RECOGNIZED_HEADERS,
    Math.ceil(allowedHeaders.length * 0.75)
  );

  return (
    headerIndex > 0 &&
    title.startsWith(TEMPLATE_TITLE_PREFIX) &&
    recognizedCount >= requiredCoverage
  );
}

export function parseSpreadsheetRows(
  aoa,
  { maxRows = 500, allowedHeaders = [] } = {}
) {
  if (!Array.isArray(aoa) || aoa.length === 0) {
    return { ok: false, error: "برگه خالی است." };
  }
  if (!Array.isArray(allowedHeaders) || allowedHeaders.length === 0) {
    throw new TypeError("allowedHeaders must be a non-empty array");
  }

  const headerMatch = findHeaderRow(aoa, allowedHeaders);
  if (!headerMatch) {
    return {
      ok: false,
      error: "ردیف نام ستون‌ها پیدا نشد — از قالب رسمی استفاده کن یا کلیدهای انگلیسی ستون‌ها را در یک ردیف قرار بده.",
    };
  }

  const headers = (aoa[headerMatch.index] || []).map(normalizedCell);
  const template = isMedoriaTemplate(
    aoa,
    headerMatch.index,
    headerMatch.count,
    allowedHeaders
  );

  // The official template contains one styled example row immediately after
  // its machine-key header. It is documentation, not product data.
  const firstDataRow = headerMatch.index + 1 + (template ? 1 : 0);
  const body = aoa.slice(firstDataRow);
  const truncated = body.length > maxRows;

  const rows = body
    .slice(0, maxRows)
    .map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        if (header) {
          row[header] = cells?.[index] != null ? String(cells[index]).trim() : "";
        }
      });
      return row;
    })
    .filter((row) => Object.values(row).some((value) => value !== ""));

  return {
    ok: true,
    headers,
    rows,
    truncated,
    headerRow: headerMatch.index + 1,
    template,
  };
}
