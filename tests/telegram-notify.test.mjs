// Optional Telegram notice for new customer inquiries: off by default, private by
// default, and unable to fail or slow the form.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { telegramConfig, formatQuoteNotice, notifyNewQuote } from "../lib/notify/telegram.js";

const TOKEN = "123456789:AAH-testtoken_testtoken_testtoken_1234";
const HEALTH_CHAT = "-1001111111111";
const BEAUTY_CHAT = "-1002222222222";
const ENV = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_CHAT_ID_HEALTH: HEALTH_CHAT,
  TELEGRAM_CHAT_ID_BEAUTY: BEAUTY_CHAT,
  NEXT_PUBLIC_SITE_URL: "https://medoriaco.com/",
};
const ROW = {
  name: "Dr. Rahimi",
  phone: "+992 900 000 000",
  organization: "City Clinic",
  product_name: "Operating room gown",
  product_sku: "ORG-1",
  quantity: 40,
  message: "Please quote\nfor 40 units",
  preferred_contact: "telegram",
  language: "tg",
};

test("off unless a house has BOTH a token and its own chat id", () => {
  for (const kind of ["health", "beauty"]) {
    assert.equal(telegramConfig(kind, {}), null);
    assert.equal(telegramConfig(kind, { TELEGRAM_BOT_TOKEN: TOKEN }), null);
    assert.equal(telegramConfig(kind, { TELEGRAM_CHAT_ID_HEALTH: "-1", TELEGRAM_CHAT_ID_BEAUTY: "-2" }), null);
    assert.equal(telegramConfig(kind, { TELEGRAM_BOT_TOKEN: "  ", TELEGRAM_CHAT_ID_HEALTH: "  ", TELEGRAM_CHAT_ID_BEAUTY: "  " }), null);
  }
  assert.equal(telegramConfig("health", ENV).chatId, HEALTH_CHAT);
  assert.equal(telegramConfig("beauty", ENV).chatId, BEAUTY_CHAT);
});

test("each house is switched on independently", () => {
  const onlyHealth = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID_HEALTH: HEALTH_CHAT };
  assert.ok(telegramConfig("health", onlyHealth));
  assert.equal(telegramConfig("beauty", onlyHealth), null);
  const onlyBeauty = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID_BEAUTY: BEAUTY_CHAT };
  assert.equal(telegramConfig("health", onlyBeauty), null);
  assert.ok(telegramConfig("beauty", onlyBeauty));
});

test("the old single TELEGRAM_CHAT_ID is ignored: a Beauty inquiry can never land in a shared group", () => {
  const legacy = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "-100999" };
  assert.equal(telegramConfig("health", legacy), null);
  assert.equal(telegramConfig("beauty", legacy), null);
});

test("a per-house token overrides the shared one; the other house keeps the shared token", () => {
  const OTHER = "987654321:AAH-other_other_other_other_other_12";
  const env = { ...ENV, TELEGRAM_BOT_TOKEN_BEAUTY: OTHER };
  assert.equal(telegramConfig("beauty", env).token, OTHER);
  assert.equal(telegramConfig("health", env).token, TOKEN);
  const separate = { TELEGRAM_BOT_TOKEN_HEALTH: TOKEN, TELEGRAM_BOT_TOKEN_BEAUTY: OTHER, TELEGRAM_CHAT_ID_HEALTH: HEALTH_CHAT, TELEGRAM_CHAT_ID_BEAUTY: BEAUTY_CHAT };
  assert.equal(telegramConfig("health", separate).token, TOKEN);
  assert.equal(telegramConfig("beauty", separate).token, OTHER);
});

test("not configured: no network call at all", async () => {
  let called = false;
  for (const kind of ["health", "beauty"]) {
    const out = await notifyNewQuote({ kind, id: 1, row: ROW }, { env: {}, fetchImpl: () => ((called = true), null) });
    assert.deepEqual(out, { sent: false, reason: "not_configured" });
  }
  assert.equal(called, false);
});

test("the notice carries no phone number and no message text by default", () => {
  const text = formatQuoteNotice({ kind: "health", id: 12, row: ROW, siteUrl: "https://medoriaco.com", includeDetails: false });
  assert.match(text, /^Medoria Health: new inquiry #12$/m);
  assert.match(text, /Name: Dr\. Rahimi/);
  assert.match(text, /Organization: City Clinic/);
  assert.match(text, /Product: Operating room gown \(ORG-1\) x 40/);
  assert.match(text, /Prefers: telegram \(tg\)/);
  assert.match(text, /Open: https:\/\/medoriaco\.com\/operator\/quotes$/);
  assert.ok(!text.includes("992"), "phone leaked");
  assert.ok(!text.includes("Please quote"), "message leaked");
});

test("TELEGRAM_INCLUDE_DETAILS adds phone and a one-line message", () => {
  assert.equal(telegramConfig("health", { ...ENV, TELEGRAM_INCLUDE_DETAILS: "true" }).includeDetails, true);
  assert.equal(telegramConfig("beauty", { ...ENV, TELEGRAM_INCLUDE_DETAILS: "true" }).includeDetails, true);
  assert.equal(telegramConfig("health", { ...ENV, TELEGRAM_INCLUDE_DETAILS: "" }).includeDetails, false);
  const text = formatQuoteNotice({ kind: "health", id: 1, row: ROW, siteUrl: "https://x.test", includeDetails: true });
  assert.match(text, /Phone: \+992 900 000 000/);
  assert.match(text, /Message: Please quote for 40 units/); // newline collapsed
});

test("Beauty notices say Beauty and link to the Beauty panel", () => {
  const text = formatQuoteNotice({ kind: "beauty", id: 3, row: ROW, siteUrl: "https://medoriaco.com" });
  assert.match(text, /^Medoria Beauty: new inquiry #3$/m);
  assert.match(text, /\/beauty\/operator\/quotes$/);
});

test("visitor text is flattened and capped: no control characters, no multi-line injection", () => {
  const evil = { ...ROW, name: "A\u0000B\nC\r\nD " + "x".repeat(500), organization: "Org\nOpen: https://evil.test" };
  const text = formatQuoteNotice({ kind: "health", id: 1, row: evil, siteUrl: "https://medoriaco.com" });
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text));
  const name = text.split("\n").find((l) => l.startsWith("Name:"));
  assert.ok(name.length <= 90, `name line too long: ${name.length}`);
  assert.equal(text.split("\n").filter((l) => l.startsWith("Open: ")).length, 1, "a visitor must not add its own Open: line");
});

test("sends one JSON POST to the bot API with the chat id, plain text, no markup mode", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => ((calls.push({ url, init }), new Response("{}", { status: 200 })));
  const out = await notifyNewQuote({ kind: "health", id: 7, row: ROW }, { env: ENV, fetchImpl });
  assert.deepEqual(out, { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(calls[0].init.method, "POST");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, HEALTH_CHAT);
  assert.match(body.text, /new inquiry #7/);
  assert.equal(body.parse_mode, undefined);
  assert.match(body.text, /Open: https:\/\/medoriaco\.com\/operator\/quotes$/, "trailing slash of NEXT_PUBLIC_SITE_URL is normalised");
  assert.ok(calls[0].init.signal, "the request is time-boxed");
});

test("Health inquiries go to the Health group and Beauty inquiries to the Beauty group", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => ((sent.push(JSON.parse(init.body))), new Response("{}", { status: 200 }));
  await notifyNewQuote({ kind: "health", id: 1, row: ROW }, { env: ENV, fetchImpl });
  await notifyNewQuote({ kind: "beauty", id: 2, row: ROW }, { env: ENV, fetchImpl });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].chat_id, HEALTH_CHAT);
  assert.match(sent[0].text, /^Medoria Health: new inquiry #1/);
  assert.equal(sent[1].chat_id, BEAUTY_CHAT);
  assert.match(sent[1].text, /^Medoria Beauty: new inquiry #2/);
  assert.match(sent[1].text, /\/beauty\/operator\/quotes$/);
});

test("a house without a chat id sends nothing while the other house still works", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => ((sent.push(JSON.parse(init.body))), new Response("{}", { status: 200 }));
  const env = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID_HEALTH: HEALTH_CHAT };
  assert.deepEqual(await notifyNewQuote({ kind: "beauty", id: 1, row: ROW }, { env, fetchImpl }), { sent: false, reason: "not_configured" });
  assert.deepEqual(await notifyNewQuote({ kind: "health", id: 2, row: ROW }, { env, fetchImpl }), { sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, HEALTH_CHAT);
});

test("never throws and never logs the token or the message, whatever Telegram does", async () => {
  const logged = [];
  const realError = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const rejected = await notifyNewQuote({ kind: "health", id: 1, row: ROW }, { env: ENV, fetchImpl: async () => new Response("no", { status: 401 }) });
    assert.deepEqual(rejected, { sent: false, reason: "http_401" });
    const boom = await notifyNewQuote({ kind: "health", id: 1, row: ROW }, { env: ENV, fetchImpl: async () => { throw new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`); } });
    assert.deepEqual(boom, { sent: false, reason: "network" });
    // AbortSignal.timeout() uses an unref'd timer: keep the event loop alive for the test
    const keepAlive = setTimeout(() => {}, 1000);
    const timeout = await notifyNewQuote({ kind: "health", id: 1, row: ROW }, { env: ENV, timeoutMs: 20, fetchImpl: (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))) });
    clearTimeout(keepAlive);
    assert.deepEqual(timeout, { sent: false, reason: "network" });
  } finally {
    console.error = realError;
  }
  const all = logged.join("\n");
  assert.ok(all.length > 0, "failures are logged");
  assert.ok(!all.includes(TOKEN) && !all.includes("AAH-test"), "token leaked into the log");
  assert.ok(!all.includes("Rahimi") && !all.includes("992"), "inquiry data leaked into the log");
});

test("both quote actions save first, then notify, and never let the notice decide the result", () => {
  for (const file of ["lib/actions/quote.js", "lib/beauty/actions/quote.js"]) {
    const s = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(s, /from "@\/lib\/notify\/telegram"/, file);
    const insert = s.indexOf("await insertRequest(db, ")   // the shared insert (lib/inquiry/save.js);
    const notify = s.indexOf("await notifyNewQuote(");
    const ok = s.indexOf("return { ok: true };", notify);
    assert.ok(insert > 0 && notify > insert && ok > notify, `${file}: order must be insert -> notify -> ok`);
  }
});
