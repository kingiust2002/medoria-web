// lib/operator/systemChecks.js — what the APP can check about itself, right now, when the System status screen opens (N13). Each check really runs; a check that
// cannot run says "unknown" — never "ok". Plain module (the client is passed in). Presence of a setting is reported, its value never.
//   databaseProbe(admin)       → can the app read the database with its service key?
//   migrationProbes(admin)     → for each migration the panel work added: is its table / column there? (present | missing | unknown)
//   configChecks(env)          → which settings exist (true/false), nothing else
import { tr } from "../panel/i18n.js";

// [migration, table, column?] — a table or a column that exists only after that migration
export const MIGRATION_PROBES = [
  [30, "operator_sessions"], [34, "operator_users"], [35, "operator_change_requests"], [36, "health_stock_balances"], [37, "quote_requests", "follow_up_at"],
  [38, "product_versions"], [39, "products", "publish_at"], [40, "products", "translation_meta"], [41, "health_stock_counts"], [42, "site_content"],
  [43, "quote_requests", "phone_key"], [44, "products", "variant_of"], [45, "health_stock_lots"], [46, "publish_rules"], [47, "categories", "image_focus_x"],
  [48, "product_documents"], [49, "operator_saved_views"], [50, "operator_preferences"], [52, "ops_status"],
];
// 51 (contact / featured kinds of the site content) is a constraint, not a table or column: there is nothing to read, so it is listed as "no probe".
export const UNPROBED = [51];

const isMissingTable = (e) => e && (["42P01", "PGRST205"].includes(e.code) || /does not exist|schema cache/i.test(String(e.message || "")) && !/column/i.test(String(e.message || "")));
const isMissingColumn = (e) => e && (["42703", "PGRST204"].includes(e.code) || /column .* does not exist|could not find .* column/i.test(String(e.message || "")));

export async function probe(admin, [migration, table, column]) {
  try {
    const { error } = await admin.from(table).select(column || "*", { head: true, count: "exact" }).limit(1);
    if (!error) return { migration, state: "present" };
    if (isMissingTable(error) || isMissingColumn(error)) return { migration, state: "missing" };
    return { migration, state: "unknown" };
  } catch {
    return { migration, state: "unknown" };
  }
}

export async function migrationProbes(admin) {
  const out = await Promise.all(MIGRATION_PROBES.map((p) => probe(admin, p)));
  return [...out, ...UNPROBED.map((migration) => ({ migration, state: "no_probe" }))].sort((a, b) => a.migration - b.migration);
}

// → { state: "ok" | "failed", ms }  (a read of a table every install has)
export async function databaseProbe(admin) {
  const t0 = Date.now();
  try {
    const { error } = await admin.from("products").select("id", { head: true, count: "exact" }).limit(1);
    return { state: error ? "failed" : "ok", ms: Date.now() - t0 };
  } catch {
    return { state: "failed", ms: Date.now() - t0 };
  }
}

export const CONFIG_LABELS = {
  session: tr("کلید امضای نشست‌ها"),
  serviceRole: tr("کلید سرویس پایگاه داده"),
  opsToken: tr("توکن گزارش سرور (ops)"),
  cronToken: tr("توکن اجرای زمان‌بندی‌شده (انتشار خودکار)"),
  reminderToken: tr("توکن یادآوری درخواست‌ها"),
  telegram: tr("اعلان تلگرام درخواست‌ها"),
  translate: tr("ترجمهٔ خودکار"),
};
export function configChecks(env = {}) {
  const has = (v, min = 1) => typeof v === "string" && v.trim().length >= min;
  return {
    session: has(env.OPERATOR_SESSION_SECRET, 16), serviceRole: has(env.SUPABASE_SERVICE_ROLE_KEY), opsToken: has(env.OPS_REPORT_TOKEN, 24),
    cronToken: has(env.SCHEDULE_TOKEN, 24), reminderToken: has(env.QUOTE_REMINDER_TOKEN, 24),
    telegram: has(env.TELEGRAM_BOT_TOKEN), translate: has(env.GOOGLE_TRANSLATE_API_KEY),
  };
}
