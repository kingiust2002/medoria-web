// lib/notify/telegram.js — optional "new inquiry" notice to a private Telegram chat.
//
// One notice per saved inquiry, routed by house: Health inquiries go to
// TELEGRAM_CHAT_ID_HEALTH, Beauty inquiries to TELEGRAM_CHAT_ID_BEAUTY (two separate
// private groups). One bot serves both (TELEGRAM_BOT_TOKEN); TELEGRAM_BOT_TOKEN_HEALTH /
// TELEGRAM_BOT_TOKEN_BEAUTY may override it per house. A house with no chat id simply
// sends nothing. Everything is OFF until the owner configures it, so merging this changes
// nothing (docs/QUOTE_NOTIFICATIONS.md). There is deliberately no shared fallback chat:
// a Beauty inquiry must never land in the Health group by misconfiguration.
//
// Design rules:
//   * The inquiry is already saved when this runs. A notice must NEVER fail or delay
//     the visitor: every error is swallowed, the request is time-boxed, and the
//     result is only logged.
//   * The bot token is part of the request URL, so errors are logged by class or
//     HTTP status only, never with the URL or the error message.
//   * Privacy by default: the notice carries name, organization, product, quantity
//     and the preferred channel. The phone number and the message text are added
//     only when TELEGRAM_INCLUDE_DETAILS is set (the panel has them anyway).
//   * Plain text, no parse_mode: visitor-typed text cannot inject markup.
//
// No imports and no alias paths, so node --test can load this file directly.

const API = "https://api.telegram.org";
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const trim = (v) => String(v ?? "").trim();

// kind: "health" | "beauty". Returns null when that house is not configured.
export function telegramConfig(kind, env = process.env) {
  const house = kind === "beauty" ? "BEAUTY" : "HEALTH";
  const token = trim(env[`TELEGRAM_BOT_TOKEN_${house}`]) || trim(env.TELEGRAM_BOT_TOKEN);
  const chatId = trim(env[`TELEGRAM_CHAT_ID_${house}`]);
  if (!token || !chatId) return null;
  return {
    token,
    chatId,
    includeDetails: /^(1|true|yes|on)$/i.test(trim(env.TELEGRAM_INCLUDE_DETAILS)),
  };
}

// One line of visitor-typed text: control characters and runs of whitespace
// collapsed, length capped.
function oneLine(value, max) {
  const s = String(value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatQuoteNotice({ kind, id, row, siteUrl, includeDetails = false }) {
  const beauty = kind === "beauty";
  const lines = [`Medoria ${beauty ? "Beauty" : "Health"}: new inquiry${id ? ` #${id}` : ""}`];
  lines.push(`Name: ${oneLine(row?.name, 80) || "-"}`);
  if (row?.organization) lines.push(`Organization: ${oneLine(row.organization, 100)}`);

  // A list request: the first three products with quantities, then "+N more" (names come from our database).
  const list = Array.isArray(row?.items) ? row.items : [];
  if (list.length) {
    const shown = list.slice(0, 3).map((i) => `${oneLine(i?.name, 60)} x ${Number(i?.quantity) || 1}`).join("; ");
    lines.push(`Products (${list.length}): ${shown}${list.length > 3 ? ` +${list.length - 3} more` : ""}`);
  }

  const product = list.length ? "" : [
    row?.product_name ? oneLine(row.product_name, 100) : "",
    row?.product_sku ? `(${oneLine(row.product_sku, 40)})` : "",
  ].filter(Boolean).join(" ");
  const qty = !list.length && row?.quantity ? ` x ${Number(row.quantity)}` : "";
  if (product) lines.push(`Product: ${product}${qty}`);
  else if (qty) lines.push(`Quantity:${qty.replace(" x", "")}`);

  lines.push(`Prefers: ${oneLine(row?.preferred_contact || "whatsapp", 20)}${row?.language ? ` (${oneLine(row.language, 5)})` : ""}`);
  if (includeDetails) {
    if (row?.phone) lines.push(`Phone: ${oneLine(row.phone, 40)}`);
    if (row?.message) lines.push(`Message: ${oneLine(row.message, 500)}`);
  }
  lines.push(`Open: ${String(siteUrl).replace(/\/+$/, "")}${beauty ? "/beauty/operator/quotes" : "/operator/quotes"}`);
  return lines.join("\n");
}

// Never throws. Resolves { sent: true } or { sent: false, reason }.
export async function notifyNewQuote(
  { kind, id, row },
  { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {},
) {
  const cfg = telegramConfig(kind, env);
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    const siteUrl = env.NEXT_PUBLIC_SITE_URL || "https://medoriaco.com";
    const text = formatQuoteNotice({ kind, id, row, siteUrl, includeDetails: cfg.includeDetails });
    const res = await fetchImpl(`${API}/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`telegram notice failed: HTTP ${res.status}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error(`telegram notice failed: ${err?.name || "error"}`); // never the message or URL: it holds the token
    return { sent: false, reason: "network" };
  }
}
