#!/usr/bin/env node
// scripts/telegram-chat-ids.mjs — find the chat id of each Telegram group the bot is in,
// so you can fill TELEGRAM_CHAT_ID_HEALTH / TELEGRAM_CHAT_ID_BEAUTY (docs/QUOTE_NOTIFICATIONS.md).
//
//   node scripts/telegram-chat-ids.mjs deploy/.env
//
// It reads the bot token from that env file (or from the TELEGRAM_BOT_TOKEN environment
// variable), asks Telegram which chats recently talked to the bot, and prints ONLY chat id,
// type and title. The token is never printed, and errors never include the request URL
// (the URL contains the token). Run it on the server so the token never leaves it.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function extractChats(updates) {
  const seen = new Map();
  for (const u of Array.isArray(updates) ? updates : []) {
    const holder = u.message || u.edited_message || u.channel_post || u.my_chat_member || u.chat_member || {};
    const c = holder.chat;
    if (!c || c.id == null) continue;
    const title = c.title || c.username || [c.first_name, c.last_name].filter(Boolean).join(" ") || "";
    seen.set(String(c.id), { id: String(c.id), type: String(c.type || ""), title });
  }
  return [...seen.values()];
}

export function readToken(envPath, env = process.env) {
  if (envPath && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return String(env.TELEGRAM_BOT_TOKEN || "").trim();
}

async function main() {
  const token = readToken(process.argv[2]);
  if (!token) {
    console.error("No TELEGRAM_BOT_TOKEN found. Usage: node scripts/telegram-chat-ids.mjs deploy/.env");
    process.exit(2);
  }
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    console.error(`Could not reach Telegram (${err?.name || "error"}).`); // never the URL
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Telegram answered HTTP ${res.status}${res.status === 401 ? " (the bot token is wrong or was revoked)" : ""}.`);
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  const chats = extractChats(body.result);
  if (!chats.length) {
    console.log("No chats found yet. Add the bot to each group, send \"/start@<bot username>\" in it, then run this again (Telegram keeps updates for about 24 hours).");
    return;
  }
  console.log("Chats the bot knows about (groups have a NEGATIVE id):");
  for (const c of chats) console.log(`  ${c.id.padEnd(16)} ${c.type.padEnd(11)} ${c.title}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
