// lib/operator/importTranslate.js — SERVER ONLY
// Fill the empty name_/description_ language fields of NEW product rows by
// auto-translating from whichever language the operator did fill. Same Google
// Translate v2 endpoint the per-product form uses, but batched across rows so a
// whole import costs only a handful of API calls. Best-effort: any failure
// leaves the already-provided languages untouched and never blocks the import.
import "server-only";

const LANGS = ["fa", "en", "ru", "tg"]; // priority order → first present is the source
const GROUPS = [
  { fa: "name_fa", en: "name_en", ru: "name_ru", tg: "name_tg" },
  { fa: "description_fa", en: "description_en", ru: "description_ru", tg: "description_tg" },
];
const MAX_CHARS = 5000;      // per source string (matches the form's cap)
const CHUNK_COUNT = 64;      // Google v2 allows up to 128 q segments/request
const CHUNK_CHARS = 20000;   // stay well under the per-request size limit

const nz = (v) => String(v ?? "").trim();

// writes: array of create-row payloads. Mutated in place. Returns a small report.
export async function fillTranslationsForWrites(writes, apiKey) {
  if (!apiKey || !Array.isArray(writes) || !writes.length) return { translated: 0, error: null };

  // Collect every (source→target) fill task across all rows and both groups.
  const tasks = []; // { write, field, source, target, text }
  for (const w of writes) {
    for (const g of GROUPS) {
      const source = LANGS.find((l) => nz(w[g[l]]));
      if (!source) continue; // nothing written in this group
      const text = nz(w[g[source]]).slice(0, MAX_CHARS);
      for (const target of LANGS) {
        if (target === source) continue;
        if (nz(w[g[target]])) continue; // operator already supplied this language
        tasks.push({ write: w, field: g[target], source, target, text });
      }
    }
  }
  if (!tasks.length) return { translated: 0, error: null };

  // Group by source|target so each request is one language pair.
  const byPair = new Map();
  for (const t of tasks) {
    const k = `${t.source}|${t.target}`;
    (byPair.get(k) || byPair.set(k, []).get(k)).push(t);
  }

  let translated = 0;
  let error = null;
  for (const [pair, list] of byPair) {
    const [source, target] = pair.split("|");
    for (let i = 0; i < list.length; ) {
      const chunk = [];
      let chars = 0;
      while (i < list.length && chunk.length < CHUNK_COUNT && chars < CHUNK_CHARS) {
        chunk.push(list[i]); chars += list[i].text.length; i++;
      }
      try {
        const resp = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: chunk.map((c) => c.text), source, target, format: "text" }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.data?.translations) { error = "translate_failed"; continue; }
        chunk.forEach((c, idx) => {
          const tr = json.data.translations[idx]?.translatedText;
          if (tr) { c.write[c.field] = tr; translated++; }
        });
      } catch {
        error = "translate_failed";
      }
    }
  }
  return { translated, error };
}
