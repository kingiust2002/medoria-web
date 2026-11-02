// lib/operator/importTranslate.js — SERVER ONLY
// Best-effort auto-translation for NEW product imports.
// Uses the same Cloudflare Workers AI translator as the operator forms; the logic (and the "auto" marks) is in importTranslateCore.js.
import "server-only";
import { translateProductFieldsWithCloudflare } from "@/lib/translation/cloudflare";
import { fillTranslations } from "@/lib/operator/importTranslateCore";

export const fillTranslationsForWrites = (writes) => fillTranslations(writes, translateProductFieldsWithCloudflare);
