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
const SKIP = new Set(["node_modules", "dist", "generated", ".vite"]);
const EXT = /\.(mjs|js|jsx|json|css|html)$/;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
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
