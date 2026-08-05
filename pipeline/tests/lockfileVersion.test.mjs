import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  The lockfile must name the version the manifest names (Codex-Audit
//  2026-08-05, §2).
//
//  Why a test and not a habit: `npm ci` accepts the drift SILENTLY. A stale
//  workspace version in package-lock.json produces no warning, no failed
//  install and no wrong build — it just sits there being wrong, which is the
//  same failure class as the pre-match defect this repo just spent a release
//  on. A bump is only complete when both files move.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const WORKSPACE = "apps/public";

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

/** The check itself, so the self-test below can run it against constructed input. */
export function lockfileDrift(manifest, lock, workspace) {
  const declared = manifest.version;
  const locked = lock.packages?.[workspace]?.version;
  if (locked === undefined) return `${workspace} has no entry in package-lock.json`;
  if (locked !== declared) {
    return `${workspace}: package.json says ${declared}, package-lock.json says ${locked}`;
  }
  return null;
}

test("package-lock.json carries the app version from package.json", () => {
  const manifest = readJson(`${WORKSPACE}/package.json`);
  const lock = readJson("package-lock.json");
  assert.equal(
    lockfileDrift(manifest, lock, WORKSPACE),
    null,
    "run `npm install --package-lock-only` in the same commit as the bump",
  );
});

test("that check can fail — it recognises a drifted lockfile", () => {
  const manifest = { version: "2.3.4" };
  const drifted = { packages: { [WORKSPACE]: { version: "2.3.3" } } };
  assert.match(lockfileDrift(manifest, drifted, WORKSPACE), /says 2\.3\.4.*says 2\.3\.3/);

  const missing = { packages: {} };
  assert.match(lockfileDrift(manifest, missing, WORKSPACE), /no entry/);
});
