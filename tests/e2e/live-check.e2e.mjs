// The owner-run live check (scripts/e2e/live-panel-check.mjs) is exercised here against the
// local fake-database stack, so the script itself is tested. It does not prove anything about
// the real site: that needs the owner's credentials and a test product (see the script header).
import test from "node:test";
import assert from "node:assert/strict";
import { runLiveCheck } from "../../scripts/e2e/live-panel-check.mjs";
import { BASE, state, resetDb } from "./helpers.mjs";

test("the live-check script passes against the local stack and restores the product", async () => {
  await resetDb();
  const lines = [];
  const results = await runLiveCheck({
    base: BASE, slug: "e2e-gloves", name: "E2E Product 1",
    user: process.env.E2E_HEALTH_USER, password: process.env.E2E_HEALTH_PASSWORD, log: (l) => lines.push(l),
  });
  assert.equal(results.length, 5);
  assert.ok(results.every((r) => r.ok), lines.join("\n"));
  const p = (await state()).products.find((x) => x.slug === "e2e-gloves");
  assert.equal(Number(p.price), 10, "the price was not restored");
  assert.equal(p.is_active, true, "the product was left archived");
  assert.ok(!lines.join("\n").includes(process.env.E2E_HEALTH_PASSWORD), "the password leaked into the output");
});

test("the live-check script refuses a product that is not active at the start", async () => {
  await resetDb();
  await assert.rejects(
    runLiveCheck({ base: BASE, slug: "e2e-archived", name: "E2E Product 2", user: "x", password: "y", log: () => {} }),
    /expected 200/,
  );
});
