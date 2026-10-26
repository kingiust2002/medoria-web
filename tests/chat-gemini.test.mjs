// The assistant must keep answering when Google retires a model, and must say what is wrong when it cannot.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { geminiModels, geminiChatEndpoint, DEFAULT_GEMINI_MODELS, isModelUnavailable, streamWithModelFallback, resetGeminiMemory } from "../lib/chat/gemini.js";
import { checkProvider, readEnvFile } from "../scripts/check-chat-provider.mjs";

const run = promisify(execFile);
const KEY = "AIzaSyTESTKEYTESTKEYTESTKEYTESTKEY_12345";

async function collect(gen) { let s = ""; for await (const c of gen) s += c; return s; }
const unavailable = (status = 404, detail = "models/x is not found for API version v1beta") => Object.assign(new Error(`LLM ${status}`), { status, detail });

test("models: GEMINI_MODEL wins (one or several), otherwise the maintained defaults - never gemini-2.0", () => {
  assert.deepEqual(geminiModels({ GEMINI_MODEL: "my-model" }), ["my-model"]);
  assert.deepEqual(geminiModels({ GEMINI_MODEL: " a , b ,," }), ["a", "b"]);
  assert.deepEqual(geminiModels({}), DEFAULT_GEMINI_MODELS);
  assert.deepEqual(geminiModels({ GEMINI_MODEL: "  " }), DEFAULT_GEMINI_MODELS);
  assert.ok(DEFAULT_GEMINI_MODELS.length >= 2 && DEFAULT_GEMINI_MODELS.every((m) => !/^gemini-(1\.|2\.0)/.test(m)), "retired models are not defaults");
});

test("the endpoint is Google's unless a test points it elsewhere", () => {
  assert.equal(geminiChatEndpoint({}), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(geminiChatEndpoint({ GEMINI_BASE_URL: "http://127.0.0.1:9/v1beta/" }), "http://127.0.0.1:9/v1beta/openai/chat/completions");
});

test("only 'this model cannot be used' answers move on to the next model", () => {
  assert.equal(isModelUnavailable(unavailable(404)), true);
  assert.equal(isModelUnavailable(unavailable(400, "The model gemini-2.0-flash is no longer available")), true);
  assert.equal(isModelUnavailable(unavailable(403, "model not supported for this project")), true);
  for (const e of [unavailable(401, "key"), unavailable(429, "quota exceeded"), unavailable(500, "internal"), unavailable(400, "API key not valid. Please pass a valid API key."), unavailable(403, "API key leaked"), new Error("network down")]) {
    assert.equal(isModelUnavailable(e), false, JSON.stringify([e.status, e.detail, e.message]));
  }
});

test("a retired model is skipped, the next one answers, and the working model is tried first from then on", async () => {
  resetGeminiMemory();
  const tried = [];
  const make = (model) => (async function* () {
    tried.push(model);
    if (model === "old") throw unavailable(404);
    yield "Sa"; yield "lom";
  })();
  assert.equal(await collect(streamWithModelFallback(["old", "new"], make)), "Salom");
  assert.deepEqual(tried, ["old", "new"]);
  tried.length = 0;
  assert.equal(await collect(streamWithModelFallback(["old", "new"], make)), "Salom");
  assert.deepEqual(tried, ["new"], "the model that worked is remembered for this process");
  resetGeminiMemory();
});

test("an answer with no text counts as a failure of that model", async () => {
  resetGeminiMemory();
  const make = (model) => (async function* () { if (model === "thinks") return; yield "ok"; })();
  assert.equal(await collect(streamWithModelFallback(["thinks", "plain"], make)), "ok");
  resetGeminiMemory();
});

test("a bad key, a quota error or an outage is NOT retried on other models; a half-sent answer is never restarted", async () => {
  resetGeminiMemory();
  let calls = 0;
  await assert.rejects(collect(streamWithModelFallback(["a", "b", "c"], () => (async function* () { calls++; throw unavailable(429, "quota"); })())), /LLM 429/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(collect(streamWithModelFallback(["a", "b"], () => (async function* () { calls++; yield "par"; throw unavailable(404); })())));
  assert.equal(calls, 1, "after text was sent the stream is not restarted on another model");
  const all = streamWithModelFallback(["a", "b"], () => (async function* () { throw unavailable(404); })());
  await assert.rejects(collect(all), /LLM 404/, "when every model is unavailable the last error surfaces");
  resetGeminiMemory();
});

// ── the owner-run key check against a mock Google ───────────────────────────
function mockGoogle(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : {};
        seen.push({ url: req.url, model: parsed.model, key: req.headers["x-goog-api-key"] });
        const [status, payload] = handler(parsed.model);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() }));
  });
}
const okBody = { choices: [{ message: { content: "OK" } }] };

test("check: a retired first model and a working second one -> PASS for the second, exit 0, key sent only as a header", async () => {
  const g = await mockGoogle((m) => (m === "old" ? [404, { error: { message: "models/old is not found" } }] : [200, okBody]));
  const r = await checkProvider({ env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: "old,new" }, base: g.base });
  g.close();
  assert.deepEqual(r.results.map((x) => [x.model, x.outcome]), [["old", "FAIL"], ["new", "PASS"]]);
  assert.equal(r.exit, 0);
  assert.ok(g.seen.every((s) => s.key === KEY && !s.url.includes(KEY)), "the key is never put in the URL");
});

test("check: a rejected key stops at once (exit 1) and the key is never echoed", async () => {
  const g = await mockGoogle(() => [400, { error: { message: `API key not valid. Please pass a valid API key. (${KEY})` } }]);
  const r = await checkProvider({ env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: "a,b,c" }, base: g.base });
  g.close();
  assert.equal(r.exit, 1);
  assert.equal(g.seen.length, 1, "no point asking the other models");
  assert.match(r.keyProblem, /rejected the key/);
  assert.ok(!JSON.stringify(r).includes(KEY), "the key must be masked");
});

test("check: no key -> exit 1 without any request; quota or server errors prove nothing (exit 3); an empty answer fails", async () => {
  assert.equal((await checkProvider({ env: {}, base: "http://127.0.0.1:1" })).exit, 1);
  for (const status of [429, 500, 503]) {
    const g = await mockGoogle(() => [status, "x"]);
    const r = await checkProvider({ env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: "m" }, base: g.base });
    g.close();
    assert.equal(r.exit, 3, `HTTP ${status}`);
    assert.equal(r.results[0].outcome, "UNKNOWN");
  }
  const g = await mockGoogle(() => [200, { choices: [{ message: { content: "" } }] }]);
  const r = await checkProvider({ env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: "m" }, base: g.base });
  g.close();
  assert.equal(r.results[0].outcome, "FAIL");
  assert.equal(r.exit, 1);
  const down = await checkProvider({ env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: "m" }, base: "http://127.0.0.1:1" });
  assert.equal(down.exit, 3, "an unreachable network says nothing about the key");
});

test("check CLI: --file reads only the two variables it needs, prints PASS and the model, never the key", async () => {
  const g = await mockGoogle(() => [200, okBody]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chatcheck-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, `SUPABASE_SERVICE_ROLE_KEY=secret-do-not-read\nGEMINI_API_KEY="${KEY}"\nGEMINI_MODEL=m1\n`);
  assert.deepEqual(readEnvFile(file), { GEMINI_API_KEY: KEY, GEMINI_MODEL: "m1" });
  const { stdout, stderr } = await run(process.execPath, ["scripts/check-chat-provider.mjs", `--file=${file}`], { env: { PATH: process.env.PATH, GEMINI_BASE_URL: g.base } });
  g.close();
  assert.match(stdout, /PASS\s+m1/);
  assert.match(stdout, /will answer with m1/);
  assert.ok(!stdout.includes(KEY) && !stderr.includes(KEY) && !stdout.includes("secret-do-not-read"));
  const missing = await run(process.execPath, ["scripts/check-chat-provider.mjs", `--file=${dir}/nope`]).catch((e) => e);
  assert.equal(missing.code, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("both chat routes use the model fallback and send the key only as a header", () => {
  for (const f of ["app/api/chat/route.js", "app/api/beauty-chat/route.js"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /streamWithModelFallback\(geminiModels\(\)/, `${f} must try the maintained models`);
    assert.ok(!/gemini-2\.0/.test(src), `${f} must not name the retired model`);
    assert.match(src, /Authorization: `Bearer \$\{apiKey\}`/);
  }
});
