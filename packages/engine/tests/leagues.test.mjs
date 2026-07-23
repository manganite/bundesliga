import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LEAGUES, isLeague, leagueLabel, leagueShort, leagueOrdinal, leagueTier, otherLeague, leagueSeasonLabel,
} from "../src/leagues.mjs";

test("both leagues have a distinct, non-empty label in every form", () => {
  const forms = [leagueLabel, leagueShort, leagueOrdinal];
  for (const form of forms) {
    const seen = LEAGUES.map(form);
    assert.equal(new Set(seen).size, LEAGUES.length, `${seen.join(" / ")} is not unambiguous`);
    for (const s of seen) assert.ok(s.trim().length > 0);
  }
  assert.equal(leagueLabel("bl1"), "Bundesliga");
  assert.equal(leagueLabel("bl2"), "2. Bundesliga");
});

test("an unknown league is an error, never a blank heading", () => {
  for (const bad of [undefined, null, "", "bl3", "BL1", "bundesliga"]) {
    assert.throws(() => leagueLabel(bad), /unknown league/, `${bad} was labelled instead of refused`);
    assert.equal(isLeague(bad), false);
  }
  // Prototype keys must not sneak through as valid leagues.
  assert.equal(isLeague("toString"), false);
  assert.throws(() => leagueLabel("toString"), /unknown league/);
});

test("tier and the other league are consistent", () => {
  assert.equal(leagueTier("bl1"), 1);
  assert.equal(leagueTier("bl2"), 2);
  assert.equal(otherLeague("bl1"), "bl2");
  assert.equal(otherLeague("bl2"), "bl1");
  for (const l of LEAGUES) assert.notEqual(otherLeague(l), l);
});

test("a heading carries the league AND the season — the numbering alone is ambiguous", () => {
  assert.equal(leagueSeasonLabel("bl1", "2026/27"), "Bundesliga 2026/27");
  assert.equal(leagueSeasonLabel("bl2", "2026/27"), "2. Bundesliga 2026/27");
});

// The point of the module: no component may hand-write a league name, because
// the moment two of them disagree the toggle becomes a trap.
test("no view spells out a league name instead of using this module", () => {
  const roots = [
    path.resolve(import.meta.dirname, "../../../apps/public/src"),
    path.resolve(import.meta.dirname, "../../../apps/kicktipp/src"),
  ];
  let scanned = 0;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // Source only. Earlier this skipped any directory named "public", which
      // silently skipped ALL of apps/public and made the test vacuous.
      if (["node_modules", "dist", "generated"].includes(e.name) || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(jsx|js|mjs)$/.test(e.name)) {
        scanned++;
        const src = fs.readFileSync(full, "utf8");
        for (const [i, line] of src.split("\n").entries()) {
          if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) continue;
          if (/"2\. Bundesliga"|'2\. Bundesliga'/.test(line)) offenders.push(`${full}:${i + 1}`);
        }
      }
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  assert.ok(scanned > 10, `only ${scanned} files scanned — the walk is not reaching the app sources`);
  assert.deepEqual(offenders, [], `these hand-write a league name:\n${offenders.join("\n")}`);
});
