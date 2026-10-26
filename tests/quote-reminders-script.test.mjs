// scripts/self-host/quote-reminders.sh run for real (bash + curl) against a local HTTP server:
// the token reaches the endpoint as a Bearer header and nowhere else; each answer maps to the right
// exit code; the external check is pinged on start/success and on /fail; --dry-run sends nothing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/self-host/quote-reminders.sh", import.meta.url));
const TOKEN = "t0ken-" + "a1b2c3d4".repeat(5);

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const seen = [];
    const server = http.createServer((req, res) => { seen.push({ method: req.method, url: req.url, auth: req.headers.authorization || "" }); handler(req, res, seen); });
    server.listen(0, "127.0.0.1", async () => {
      try { resolve(await fn(`http://127.0.0.1:${server.address().port}`, seen)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

function run(args, env) {
  return new Promise((resolve) => {
    const p = spawn("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH, HOME: os.tmpdir(), ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("exit", (code) => resolve({ code, out, err }));
  });
}

function sandbox({ token = TOKEN, ping = "" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qr-"));
  const envFile = path.join(dir, "deploy.env");
  fs.writeFileSync(envFile, `NEXT_PUBLIC_SITE_URL=https://medoriaco.com\nQUOTE_REMINDER_TOKEN=${token}\nOTHER=1\n`);
  const conf = path.join(dir, "reminders.env");
  if (ping) fs.writeFileSync(conf, `QUOTE_REMINDER_PING_URL=${ping}\n`);
  return { dir, envFile, conf };
}

test("200: exit 0, the Bearer header carries the token, the token is never printed", async () => {
  const sb = sandbox();
  await withServer((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true,"houses":[{"kind":"health","sent":true,"overdue":2}]}'); }, async (base, seen) => {
    const r = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /quote-reminders: ok — \{"ok":true/);
    assert.deepEqual(seen.map((s) => [s.method, s.url, s.auth]), [["POST", "/api/internal/quote-reminders", `Bearer ${TOKEN}`]]);
    assert.ok(!(r.out + r.err).includes(TOKEN));
  });
  fs.rmSync(sb.dir, { recursive: true, force: true });
});

test("401, 404, 502 and an unreachable server each exit non-zero with a plain reason", async () => {
  const sb = sandbox();
  const cases = [[401, /refused the token/], [404, /endpoint is off/], [502, /could not be delivered/], [500, /unexpected answer \(HTTP 500\)/]];
  for (const [status, re] of cases) {
    await withServer((req, res) => { res.writeHead(status); res.end('{"ok":false}'); }, async (base) => {
      const r = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
      assert.equal(r.code, 1, `HTTP ${status}`);
      assert.match(r.err, re);
      assert.ok(!(r.out + r.err).includes(TOKEN));
    });
  }
  const dead = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: "http://127.0.0.1:9", MEDORIA_REMINDER_CONF: sb.conf });
  assert.equal(dead.code, 1);
  assert.match(dead.err, /unexpected answer/);
  fs.rmSync(sb.dir, { recursive: true, force: true });
});

test("a missing env file or an empty token stops with exit 2 and never calls the endpoint", async () => {
  await withServer((req, res) => { res.writeHead(200); res.end("{}"); }, async (base, seen) => {
    const sb = sandbox({ token: "" });
    const empty = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
    assert.equal(empty.code, 2);
    assert.match(empty.err, /QUOTE_REMINDER_TOKEN is not set/);
    const missing = await run([], { MEDORIA_ENV_FILE: path.join(sb.dir, "nope.env"), MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
    assert.equal(missing.code, 2);
    assert.equal(seen.length, 0);
    fs.rmSync(sb.dir, { recursive: true, force: true });
  });
});

test("the external check is pinged: /start, then success on 200, /fail on a failure", async () => {
  await withServer((req, res, seen) => { res.writeHead(200); res.end("ok"); }, async (pingBase, pings) => {
    const sb = sandbox({ ping: `${pingBase}/ping/abc` });
    await withServer((req, res) => { res.writeHead(200); res.end('{"ok":true,"houses":[]}'); }, async (base) => {
      const r = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
      assert.equal(r.code, 0, r.err);
    });
    assert.deepEqual(pings.map((p) => p.url), ["/ping/abc/start", "/ping/abc"]);
    pings.length = 0;
    await withServer((req, res) => { res.writeHead(502); res.end("{}"); }, async (base) => {
      const r = await run([], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
      assert.equal(r.code, 1);
    });
    assert.deepEqual(pings.map((p) => p.url), ["/ping/abc/start", "/ping/abc/fail"]);
    // a missing token also reports a failure (the check must not stay green while nothing runs)
    pings.length = 0;
    const noTok = sandbox({ token: "", ping: `${pingBase}/ping/abc` });
    const r = await run([], { MEDORIA_ENV_FILE: noTok.envFile, MEDORIA_BASE_URL: "http://127.0.0.1:9", MEDORIA_REMINDER_CONF: noTok.conf });
    assert.equal(r.code, 2);
    assert.deepEqual(pings.map((p) => p.url), ["/ping/abc/fail"]);
    fs.rmSync(sb.dir, { recursive: true, force: true }); fs.rmSync(noTok.dir, { recursive: true, force: true });
  });
});

test("--dry-run sends nothing and does not print the token", async () => {
  const sb = sandbox({ ping: "http://127.0.0.1:9/ping/x" });
  await withServer((req, res) => { res.writeHead(200); res.end("{}"); }, async (base, seen) => {
    const r = await run(["--dry-run"], { MEDORIA_ENV_FILE: sb.envFile, MEDORIA_BASE_URL: base, MEDORIA_REMINDER_CONF: sb.conf });
    assert.equal(r.code, 0);
    assert.match(r.out, /would POST .*\/api\/internal\/quote-reminders/);
    assert.ok(!r.out.includes(TOKEN));
    assert.equal(seen.length, 0);
  });
  fs.rmSync(sb.dir, { recursive: true, force: true });
});
