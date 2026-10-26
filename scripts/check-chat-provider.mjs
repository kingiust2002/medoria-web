#!/usr/bin/env node
// scripts/check-chat-provider.mjs — does the assistant's Gemini key work, and which model will answer?
// Run it ON THE SERVER, where the key lives; the key is read from the environment or from a --file and is
// never printed (any echo of it in an error body is masked).
//
//   node scripts/check-chat-provider.mjs --file=deploy/.env
//   GEMINI_API_KEY=... node scripts/check-chat-provider.mjs            (key from the environment)
//
// For every model the app would try (GEMINI_MODEL, else the defaults in lib/chat/gemini.js) it sends one tiny
// question and says PASS / FAIL / UNKNOWN. The app uses the first model that passes.
//   exit 0  at least one model answered
//   exit 1  the key is missing/rejected, or no model could answer
//   exit 3  nothing was proven: Google or the network answered with an error that says nothing about the key
//   exit 2  usage
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { geminiModels, geminiBase } from "../lib/chat/gemini.js";

export function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(GEMINI_API_KEY|GEMINI_MODEL)\s*=\s*(.*?)\s*$/);   // only what this check needs
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

const mask = (text, key) => (key ? String(text).split(key).join("[key]") : String(text)).replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]");
const brief = (text, key) => mask(text, key).replace(/\s+/g, " ").slice(0, 200);

async function call(fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, init);
    return { status: res.status, text: await res.text().catch(() => "") };
  } catch (e) {
    return { status: 0, text: String(e?.message || e) };
  }
}

// -> { results: [{ model, outcome: "PASS"|"FAIL"|"UNKNOWN", note }], keyProblem: string|null, exit }
export async function checkProvider({ env = process.env, fetchImpl = fetch, base = geminiBase(env) } = {}) {
  const key = String(env.GEMINI_API_KEY || "");
  if (!key) return { results: [], keyProblem: "GEMINI_API_KEY is not set", exit: 1 };
  const headers = { "x-goog-api-key": key, "content-type": "application/json" };

  const results = [];
  let keyProblem = null;
  for (const model of geminiModels(env)) {
    const r = await call(fetchImpl, `${base}/openai/chat/completions`, {
      method: "POST", headers: { ...headers, authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: OK" }], max_tokens: 256, temperature: 0 }),
    });
    if (r.status === 200) {
      let content = "";
      try { content = JSON.parse(r.text)?.choices?.[0]?.message?.content || ""; } catch { /* handled below */ }
      results.push(content.trim()
        ? { model, outcome: "PASS", note: "answered" }
        : { model, outcome: "FAIL", note: "answered with no text (reply budget spent on hidden reasoning?)" });
    } else if (r.status === 401 || (r.status === 400 && /api key|API_KEY_INVALID/i.test(r.text)) || (r.status === 403 && /api key|API_KEY|leaked|suspended|denied/i.test(r.text) && !/model/i.test(r.text))) {
      keyProblem = `Google rejected the key (HTTP ${r.status}): ${brief(r.text, key)}`;
      results.push({ model, outcome: "FAIL", note: `key rejected (HTTP ${r.status})` });
      break;                                                  // every other model would say the same
    } else if (r.status === 404 || r.status === 400 || r.status === 403) {
      results.push({ model, outcome: "FAIL", note: `model not available to this key (HTTP ${r.status}): ${brief(r.text, key)}` });
    } else if (r.status === 429) {
      results.push({ model, outcome: "UNKNOWN", note: `rate limit or quota reached (HTTP 429): the key is probably valid; wait and run again` });
    } else {
      results.push({ model, outcome: "UNKNOWN", note: r.status ? `Google answered HTTP ${r.status}: ${brief(r.text, key)}` : `no answer: ${brief(r.text, key)}` });
    }
  }
  const passed = results.some((x) => x.outcome === "PASS");
  const exit = passed ? 0 : keyProblem ? 1 : results.some((x) => x.outcome === "UNKNOWN") ? 3 : 1;
  return { results, keyProblem, exit };
}

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  let env = process.env;
  if (fileArg) {
    const file = fileArg.slice("--file=".length);
    if (!fs.existsSync(file)) { console.error(`env file not found: ${file}`); process.exit(2); }
    env = { ...process.env, ...readEnvFile(file) };
  }
  const { results, keyProblem, exit } = await checkProvider({ env });
  if (!env.GEMINI_API_KEY) console.error("GEMINI_API_KEY is not set (put it in deploy/.env and pass --file=deploy/.env, or export it for this command).");
  for (const r of results) console.log(`${r.outcome.padEnd(7)} ${r.model}  ${r.note}`);
  if (keyProblem) console.error(keyProblem);
  const first = results.find((r) => r.outcome === "PASS");
  console.log(first ? `\nThe assistant will answer with ${first.model}.` : exit === 3 ? "\nNothing proven: try again later." : "\nThe assistant would NOT be able to answer.");
  process.exit(exit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
