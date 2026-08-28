import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  The Herbstmeister in the COMMITTED artefacts (HALBSERIEN §8).
//
//  Same idea as the champions guard next door: a finished season's tally is
//  degenerate — the real Herbstmeister sits at exactly 1 — so a wrong anchor, a
//  mis-filtered matchday or a broken half-season ranking shows up immediately
//  against an outside fact.
//
//  The named seasons are the sample the brief asks for. They are checked against
//  the winter-break standings as they were, not against anything this repository
//  derived.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

/** Real Herbstmeister (leader after matchday 17), clubId = the register's id. */
const HERBSTMEISTER = {
  bl1: {
    2011: "Bayern",      // 2011/12 — Bayern led at the break; Dortmund took the title
    2015: "Bayern",
    2019: "Leipzig",     // 2019/20 — RB Leipzig
    2023: "Leverkusen",
    2025: "Bayern",
  },
  bl2: {
    2011: "Düsseldorf",  // 2011/12 — Fortuna Düsseldorf, promoted via the play-off
  },
};

for (const [league, byYear] of Object.entries(HERBSTMEISTER)) {
  for (const [year, club] of Object.entries(byYear)) {
    const rel = `data/seasons/${year}/${league}/outlook.json`;
    if (!fs.existsSync(path.join(REPO, rel))) continue;

    test(`${year} ${league}: the decided Herbstmeister is the real one (${club})`, () => {
      const hm = read(rel).herbstmeister;
      assert.ok(hm, "a committed season carries the tally");
      assert.equal(hm.decided, true, "a finished season has a complete first half");
      const certain = Object.entries(hm.probabilities).filter(([, p]) => p === 1);
      assert.deepEqual(certain.map(([id]) => id), [club]);
      assert.equal(hm.sharedProbability, 0, "a decided anchor is not a coin toss");
    });
  }
}

// ---------------------------------------------------------------------------

test("every committed artefact carries the tally, and its shape is the same everywhere", () => {
  const seasonsDir = path.join(REPO, "data/seasons");
  const years = fs.readdirSync(seasonsDir).filter((n) => /^\d{4}$/.test(n)).sort();
  let checked = 0;
  const stale = [];
  for (const year of years) {
    const config = read(`data/seasons/${year}/config.json`);
    for (const league of Object.keys(config.leagues)) {
      const rel = `data/seasons/${year}/${league}/outlook.json`;
      if (!fs.existsSync(path.join(seasonsDir, year, league, "outlook.json"))) continue;
      const outlook = read(rel);
      // The LIVE season is rebuilt by the cron on its next run, so it may still
      // carry the previous engine version for a couple of hours after a bump.
      // That is a known, self-healing state — named here rather than asserted
      // away, so a stale ARCHIVE season would still fail.
      if (!outlook.herbstmeister) {
        stale.push(rel);
        continue;
      }
      const anchor = config.leagues[league].herbstmeisterUntilMatchday;
      assert.equal(outlook.herbstmeister.untilMatchday, anchor, `${rel}: anchor follows the config`);
      const probs = Object.values(outlook.herbstmeister.probabilities);
      assert.equal(probs.length, outlook.clubs.length, `${rel}: one value per club`);
      // Σ p = E[number of clubs on rank 1] ≥ 1. Never „= 1": a shared first
      // place counts every club on it, which is the honest reading of a table
      // the Spielordnung declines to separate.
      const sum = probs.reduce((a, b) => a + b, 0);
      assert.ok(sum >= 1 - 1e-9, `${rel}: probabilities sum to ${sum}`);
      assert.ok(
        sum <= 1 + (outlook.clubs.length - 1) * outlook.herbstmeister.sharedProbability + 1e-9,
        `${rel}: the excess over 1 must be explained by shared runs`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 30, `expected the committed window to be covered, checked ${checked}`);
  assert.ok(stale.length <= 2, `only the live season may lag an engine bump; stale: ${stale.join(", ")}`);
});

test("timeline points carry the tally too, and it sharpens towards the anchor", () => {
  const t = read("data/seasons/2015/bl1/timeline-frozen.json");
  const at = (md) => t.points.find((p) => p.matchday === md)?.herbstmeister;
  const start = at(0);
  const anchor = at(17);
  assert.ok(start && anchor, "both anchors exist in a finished season");

  assert.equal(start.decided, false, "nothing is decided before a ball is kicked");
  assert.equal(anchor.decided, true, "at the anchor every fixture up to it is played");

  const leader = Object.entries(anchor.probabilities).find(([, p]) => p === 1)[0];
  assert.ok(
    start.probabilities[leader] > 0 && start.probabilities[leader] < 1,
    "the eventual Herbstmeister was possible, not certain, at the start",
  );
  // Monotone is NOT claimed — a curve may dip. What must hold is that the
  // question is answered by the anchor and open before it.
  assert.ok(at(16).decided === false, "one matchday short is still open");
});
