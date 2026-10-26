// The Dependabot setup must keep framework-level majors out of automatic pull requests (a Tailwind 4
// bump broke the build twice) and keep version updates grouped and limited.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import yaml from "js-yaml";

const cfg = yaml.load(fs.readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"));
const npm = cfg.updates.find((u) => u["package-ecosystem"] === "npm");

test("dependabot.yml is valid and covers npm, GitHub Actions and the Docker base image", () => {
  assert.equal(cfg.version, 2);
  assert.deepEqual(cfg.updates.map((u) => u["package-ecosystem"]).sort(), ["docker", "github-actions", "npm"]);
  for (const u of cfg.updates) {
    assert.equal(u.schedule.interval, "weekly");
    assert.ok(u["open-pull-requests-limit"] >= 1 && u["open-pull-requests-limit"] <= 3, "the number of open pull requests must stay small");
  }
});

test("npm: minor/patch updates are grouped; Next, React, Tailwind and ESLint majors are never proposed", () => {
  assert.deepEqual(npm.groups["minor-and-patch"]["update-types"], ["minor", "patch"]);
  const ignored = new Set(npm.ignore.filter((i) => i["update-types"]?.includes("version-update:semver-major")).map((i) => i["dependency-name"]));
  for (const name of ["next", "eslint-config-next", "react", "react-dom", "tailwindcss", "eslint"]) assert.ok(ignored.has(name), `${name} majors are not ignored`);
});

test("every package named in the ignore list really is a dependency of the project", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const i of npm.ignore) assert.ok(i["dependency-name"] in all, `${i["dependency-name"]} is not in package.json`);
  assert.ok(String(all.tailwindcss).replace(/^[\^~]/, "").startsWith("3."), "Tailwind is on 3.x; moving to 4 is a deliberate project (PostCSS plugin moved), not a bump");
});
