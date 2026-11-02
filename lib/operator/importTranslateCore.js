// lib/operator/importTranslateCore.js — best-effort automatic translation for NEW product imports. Plain module: the translator is passed in (the real one is the
// Cloudflare Workers AI translator of the operator forms, wired in importTranslate.js), so the marking of generated texts is unit-tested.
// A generated text is marked "auto" in translation_meta (migration 40) until a person reads it; a text that is already there is never overwritten.
import { cleanTranslationMeta } from "./translationMeta.js";

const LANGS = ["fa", "en", "ru", "tg"];

const GROUPS = [
  {
    kind: "name",
    fields: {
      fa: "name_fa",
      en: "name_en",
      ru: "name_ru",
      tg: "name_tg",
    },
  },
  {
    kind: "description",
    fields: {
      fa: "description_fa",
      en: "description_en",
      ru: "description_ru",
      tg: "description_tg",
    },
  },
];

const MAX_CHARS = 5000;
const nz = (v) => String(v ?? "").trim();

export async function fillTranslations(writes, translateProductFieldsWithCloudflare) {
  if (!Array.isArray(writes) || !writes.length) {
    return { translated: 0, error: null };
  }

  let translated = 0;
  let error = null;

  for (const write of writes) {
    const jobs = new Map();

    for (const group of GROUPS) {
      const source = LANGS.find((lang) => nz(write[group.fields[lang]]));
      if (!source) continue;

      const missing = LANGS.filter(
        (lang) =>
          lang !== source &&
          !nz(write[group.fields[lang]])
      );

      if (!missing.length) continue;

      const text = nz(write[group.fields[source]]).slice(0, MAX_CHARS);

      if (!jobs.has(source)) {
        jobs.set(source, {
          source,
          name: "",
          description: "",
          groups: [],
        });
      }

      const job = jobs.get(source);
      job[group.kind] = text;
      job.groups.push({
        kind: group.kind,
        fields: group.fields,
        missing,
      });
    }

    for (const job of jobs.values()) {
      const result = await translateProductFieldsWithCloudflare({
        source: job.source,
        name: job.name,
        description: job.description,
      });

      if (!result?.ok) {
        error = "translate_failed";
        continue;
      }

      for (const group of job.groups) {
        for (const target of group.missing) {
          const value = nz(
            result.translations?.[target]?.[group.kind]
          );

          if (!value) {
            error = "translate_failed";
            continue;
          }

          if (!nz(write[group.fields[target]])) {
            write[group.fields[target]] = value;
            // a generated text is the translator's until a person reads it: it is marked "auto" (migration 40, lib/operator/translationMeta.js)
            write.translation_meta = cleanTranslationMeta({ ...(write.translation_meta || {}), [group.fields[target]]: "auto" });
            translated++;
          }
        }
      }
    }
  }

  return { translated, error };
}
