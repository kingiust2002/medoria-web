// scripts/self-host/supavisor-cookie-check.sh with a fake `docker`: it must tell "ours (RELEASE_COOKIE)" from
// "not set by us", report published distribution ports, and NEVER print the cookie itself.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/self-host/supavisor-cookie-check.sh", import.meta.url));
const COOKIE = "TOP-SECRET-COOKIE-VALUE-123456";

const dockerStub = (scenario) => `#!/usr/bin/env bash
case "$1" in
  ps) echo "supabase-pooler"; echo "supabase-db" ;;
  inspect) ${scenario.env ? `printf 'PATH=/usr/bin\\nRELEASE_COOKIE=${scenario.env}\\nFOO=bar\\n'` : `printf 'PATH=/usr/bin\\nFOO=bar\\n'`} ;;
  top) ${scenario.proc ? `echo "ARGS"; echo "/usr/lib/erlang/erts/bin/beam.smp -- -setcookie ${scenario.proc} -name supavisor@127.0.0.1"` : `echo "ARGS"; echo "/app/bin/server"`} ;;
  port) ${scenario.ports ? `echo "${scenario.ports}"` : "true"} ;;
esac
`;

function run(scenario, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supa-"));
  fs.writeFileSync(path.join(dir, "docker"), dockerStub(scenario), { mode: 0o755 });
  const r = spawnSync("bash", [SCRIPT, ...args], { env: { PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout, all: r.stdout + r.stderr };
}

test("a cookie set through RELEASE_COOKIE and used by the VM is ours: exit 0", () => {
  const r = run({ env: COOKIE, proc: COOKIE });
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /SUPAVISOR_CONTAINER=supabase-pooler/);
  assert.match(r.out, /COOKIE_SOURCE=RELEASE_COOKIE from the container environment: ours/);
  assert.match(r.out, /DISTRIBUTION_PORT_PUBLISHED=no/);
  assert.ok(!r.all.includes(COOKIE), "the cookie was printed");
});

test("a VM cookie that the environment does not provide is 'not set by us': exit 1, still never printed", () => {
  const r = run({ proc: COOKIE });
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /RELEASE_COOKIE_ENV=not set/);
  assert.match(r.out, /COOKIE_SOURCE=NOT set by us/);
  assert.ok(!r.all.includes(COOKIE));
  const r2 = run({ env: "a-different-value-we-set", proc: COOKIE });
  assert.equal(r2.code, 1);
  assert.match(r2.out, /NOT set by us/);
  assert.ok(!r2.all.includes(COOKIE) && !r2.all.includes("a-different-value-we-set"));
});

test("no visible cookie argument is 'unknown'; a published Erlang port fails the check", () => {
  const r = run({});
  assert.equal(r.code, 1);
  assert.match(r.out, /RUNNING_VM_COOKIE=not visible/);
  assert.match(r.out, /COOKIE_SOURCE=unknown/);
  const exposed = run({ env: COOKIE, proc: COOKIE, ports: "4369/tcp -> 0.0.0.0:4369" });
  assert.equal(exposed.code, 1);
  assert.match(exposed.out, /DISTRIBUTION_PORT_PUBLISHED=YES/);
});

test("an explicit container name is used; an unknown container is reported", () => {
  assert.match(run({ env: COOKIE, proc: COOKIE }, ["my-pooler"]).out, /SUPAVISOR_CONTAINER=my-pooler/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supa-"));
  fs.writeFileSync(path.join(dir, "docker"), "#!/usr/bin/env bash\n[ \"$1\" = ps ] && echo supabase-db\nexit 0\n", { mode: 0o755 });
  const r = spawnSync("bash", [SCRIPT], { env: { PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /SUPAVISOR_CONTAINER=NOT_FOUND/);
});
