import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadLog, saveLog, addEntry, recordResult, exportLog, importLog, realisedFigures,
  LOG_SCHEMA_VERSION, LogError,
} from "../src/log.mjs";

const entry = {
  tippedAt: "2026-08-28T12:00:00.000Z",
  home: "FC Bayern München",
  away: "VfB Stuttgart",
  odds: { home: 1.45, draw: 4.8, away: 6.2 },
  quotas: { homeWin: 3, draw: 6, awayWin: 8 },
  tip: { home: 2, away: 0 },
  expectedPoints: 3.4,
};

const empty = () => ({ schemaVersion: LOG_SCHEMA_VERSION, entries: [] });

test("an entry records the quotas and odds as they stood AT TIP TIME", () => {
  const log = addEntry(empty(), entry);
  assert.equal(log.entries.length, 1);
  assert.deepEqual(log.entries[0].odds, entry.odds);
  assert.deepEqual(log.entries[0].quotas, entry.quotas);
  assert.deepEqual(log.entries[0].tip, { home: 2, away: 0 });
  assert.equal(log.entries[0].result, null);

  // Mutating the source afterwards must not reach into the log.
  entry.odds.home = 99;
  assert.equal(log.entries[0].odds.home, 1.45);
  entry.odds.home = 1.45;
});

test("an incomplete entry is rejected", () => {
  for (const key of ["tippedAt", "home", "away", "odds", "quotas", "tip"]) {
    const broken = { ...entry };
    delete broken[key];
    assert.throws(() => addEntry(empty(), broken), new RegExp(key));
  }
});

test("export carries the schema version and re-imports cleanly", () => {
  const log = addEntry(empty(), entry);
  const text = exportLog(log);
  const parsed = JSON.parse(text);
  assert.equal(parsed.schemaVersion, LOG_SCHEMA_VERSION);
  assert.ok(parsed.exportedAt);

  const back = importLog(text);
  assert.equal(back.entries.length, 1);
  assert.deepEqual(back.entries[0].tip, { home: 2, away: 0 });
});

// Silently reinterpreting an unknown version is how a log quietly becomes wrong.
test("an unknown schema version is rejected, not guessed at", () => {
  assert.throws(() => importLog(JSON.stringify({ schemaVersion: 99, entries: [] })), /nicht unterstützt/);
  assert.throws(() => importLog(JSON.stringify({ entries: [] })), /nicht unterstützt/);
  assert.throws(() => importLog("kein json"), /kein gültiges JSON/);
  assert.throws(
    () => importLog(JSON.stringify({ schemaVersion: LOG_SCHEMA_VERSION, entries: "nope" })),
    LogError,
  );
});

test("a result can be attached after the match", () => {
  let log = addEntry(empty(), entry);
  log = recordResult(log, 0, { home: 2, away: 0 }, 5);
  assert.deepEqual(log.entries[0].result, { home: 2, away: 0 });
  assert.equal(log.entries[0].points, 5);
  assert.throws(() => recordResult(log, 7, { home: 1, away: 1 }, 3), /no entry at index/);
});

// §9 forbids printing a fixed hit-rate figure. Before any result is in, there is
// no figure — and the code must say nothing rather than invent one.
test("realised figures are null until results exist", () => {
  const log = addEntry(empty(), entry);
  const f = realisedFigures(log);
  assert.equal(f.matches, 0);
  assert.equal(f.hitRate, null);
  assert.equal(f.meanPoints, null);
});

test("realised figures are computed once results exist", () => {
  let log = addEntry(empty(), entry);
  log = addEntry(log, { ...entry, tip: { home: 0, away: 1 } });
  log = recordResult(log, 0, { home: 2, away: 0 }, 5); // tendency hit
  log = recordResult(log, 1, { home: 3, away: 0 }, 0); // tendency miss
  const f = realisedFigures(log);
  assert.equal(f.matches, 2);
  assert.equal(f.hitRate, 0.5);
  assert.equal(f.meanPoints, 2.5);
});

test("a corrupt local store degrades to an empty log rather than throwing", () => {
  const storage = {
    getItem: () => "{ not json",
    setItem: () => { throw new Error("quota"); },
  };
  assert.deepEqual(loadLog(storage), empty());
  // A failed save is reported, not fatal — the export is the copy that matters.
  assert.equal(saveLog(empty(), storage), false);
});

test("localStorage is optional — the module works without it", () => {
  assert.deepEqual(loadLog(null), empty());
  assert.equal(saveLog(empty(), null), false);
});

// ---------------------------------------------------------------------------
// A structural guard, not a comment: §9 forbids assigning pasted markup via
// innerHTML or any equivalent. This asserts the source actually honours it.
// ---------------------------------------------------------------------------

test("no source file assigns innerHTML, outerHTML or uses insertAdjacentHTML", () => {
  const dir = path.resolve(import.meta.dirname, "../src");
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs)$/.test(e.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const pattern of [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/]) {
        if (pattern.test(text)) offenders.push(`${path.relative(dir, full)}: ${pattern}`);
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `pasted markup must never reach the DOM:\n${offenders.join("\n")}`);
});
