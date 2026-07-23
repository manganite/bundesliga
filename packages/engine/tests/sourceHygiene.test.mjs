import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// A source file containing a literal NUL byte is treated as BINARY by grep, git
// diff and most editors' search. It still runs, so nothing fails — searches just
// silently skip it. That happened here: rng.mjs carried four literal NULs as key
// separators, and every grep over the codebase quietly missed the file,
// including a verification pass that was supposed to confirm one of its exports.
//
// The separator itself is right (NUL cannot occur in a club or fixture id); it
// simply has to be written as the escape sequence.
const ROOTS = ["packages", "pipeline", "apps"];
const SKIP = new Set(["node_modules", "dist", "generated"]);
// Build output, never source. `.out` is the JSX test harness's bundle and is
// written WHILE other test files run — node:test runs each file in its own
// process — so scanning it is both pointless and racy.
const isBuildDir = (name) => name.startsWith(".");
const EXT = /\.(mjs|js|jsx|json|css|html)$/;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || isBuildDir(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const files = ROOTS.flatMap((r) => {
  const dir = path.join(repoRoot, r);
  return fs.existsSync(dir) ? sourceFiles(dir) : [];
});

test("the source tree is non-empty — the scan must not pass by finding nothing", () => {
  assert.ok(files.length > 30, `only ${files.length} source files found`);
});

test("no source file contains a literal NUL byte", () => {
  const offenders = files
    .filter((f) => fs.readFileSync(f).includes(0))
    .map((f) => path.relative(repoRoot, f));
  assert.deepEqual(
    offenders,
    [],
    "these files are binary to grep and every search over them silently misses:\n"
      + `${offenders.join("\n")}\nWrite NUL as the escape sequence instead.`,
  );
});

// The BL2 deltas are values in season-params.json and are applied in exactly
// one place: `effectiveParams`. A second application site is the failure this
// guards against — it would not break any test, it would simply mean the league
// toggle and the play-off disagree about what BL2 is, in one of them.
//
// Naming a delta is allowed where a file must know the parameter EXISTS (the fit
// declares its transform and start value; the tolerance file bounds it). Adding
// one to a base value is not.
test("the BL2 deltas are added to a base value in exactly one place", () => {
  // A delta NAMED is fine; a delta with a `+` or `-` anywhere ahead of it on the
  // same line is arithmetic — the thing that may exist only once.
  const DELTA = /\b\w+_BL2\b/;
  const APPLIES = /[+\-][^\n]*\b\w+_BL2\b/;
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(repoRoot, f);
    if (rel === path.join("packages", "engine", "src", "model.mjs")) continue; // the one place
    if (rel.includes(`${path.sep}tests${path.sep}`)) continue; // tests may assert the arithmetic
    const src = fs.readFileSync(f, "utf8");
    if (!DELTA.test(src)) continue;
    for (const [i, line] of src.split("\n").entries()) {
      if (APPLIES.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these lines apply a BL2 delta outside effectiveParams():\n" + offenders.join("\n"),
  );
});

test("that scan can fail — it recognises an applied delta", () => {
  const APPLIES = /[+\-][^\n]*\b\w+_BL2\b/;
  assert.ok(APPLIES.test("  const h = p.HOME_ADV + p.HOME_ADV_BL2;"));
  assert.ok(APPLIES.test("BASE_TOTAL: base.BASE_TOTAL + (bl2 ? (base.BASE_TOTAL_BL2 ?? 0) : 0),"));
  assert.ok(!APPLIES.test("  HOME_ADV_BL2: { to: (x) => x, from: (z) => z },"), "a declaration is fine");
  assert.ok(!APPLIES.test('  "ELO_PER_GOAL_BL2": 0.4'), "a value is fine");
});

test("every source file is valid UTF-8", () => {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const offenders = [];
  for (const f of files) {
    try {
      decoder.decode(fs.readFileSync(f));
    } catch {
      offenders.push(path.relative(repoRoot, f));
    }
  }
  assert.deepEqual(offenders, [], `invalid UTF-8:\n${offenders.join("\n")}`);
});
