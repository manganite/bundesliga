import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { simulateSeason } from "../src/simulate.mjs";
import { buildTable, rankTable } from "../src/ranking.mjs";

// ============================================================================
//  The Herbstmeister tally (HALBSERIEN §1).
//
//  The load-bearing claim of this feature is NEGATIVE: adding a second ranking
//  of each run must not move a single number that existed before it. The tally
//  reads results the run already drew; it draws nothing. Test 1 is that claim,
//  and it is the one that would catch a future „small" refactor that reaches
//  for the random stream.
// ============================================================================

const P = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../data/season-params.json"), "utf8"),
).params;

/**
 * A double round robin WITH matchdays, by the circle method: n−1 matchdays for
 * the first leg, then the same pairings with home and away swapped. That makes
 * matchdays 1..n−1 the Hinrunde, which is the whole point of the anchor.
 */
function scheduleRoundRobin(ids) {
  const n = ids.length;
  assert.equal(n % 2, 0, "circle method needs an even club count");
  const rot = ids.slice(1);
  const out = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [[ids[0], rot[r % rot.length]]];
    for (let k = 1; k < n / 2; k++) {
      round.push([rot[(r + k) % rot.length], rot[(r + rot.length - k) % rot.length]]);
    }
    for (const [a, b] of round) {
      // Alternate the venue by round so no club is at home every week.
      const [home, away] = r % 2 === 0 ? [a, b] : [b, a];
      out.push({ id: `${home}-${away}`, home, away, matchday: r + 1 });
      out.push({ id: `${away}-${home}`, home: away, away: home, matchday: r + n });
    }
  }
  return out.sort((x, y) => x.matchday - y.matchday);
}

const clubs = Array.from({ length: 18 }, (_, i) => ({
  clubId: `C${String(i + 1).padStart(2, "0")}`,
  rating: 1800 - i * 25,
}));
const TARGETS = {
  meister: { places: 1, positions: (r) => r === 1 },
  abstieg: { places: 2, positions: (r) => r >= 17 },
};
const base = {
  seasonId: "2026", league: "bl1", clubs, params: P, targets: TARGETS, runs: 2000, batches: 20,
};

// ---------------------------------------------------------------------------
//  §0 / §8 — the bit-identity anchor.
// ---------------------------------------------------------------------------

test("the tally adds fields and moves NOTHING — every prior number is bit-identical", () => {
  const fixtures = scheduleRoundRobin(clubs.map((c) => c.clubId));
  const without = simulateSeason({ ...base, fixtures });
  const with_ = simulateSeason({ ...base, fixtures, herbstmeisterUntilMatchday: 17 });

  // The artefact SHAPE does not depend on the configuration: `herbstmeister` is
  // always a key, null when no anchor is configured. A field that appears and
  // disappears would make every consumer guess whether „missing" means „not
  // configured" or „older artefact".
  assert.deepEqual(Object.keys(with_), Object.keys(without), "the key set is the same either way");
  assert.equal(without.herbstmeister, null, "no anchor configured → null, not absent");

  // Every pre-existing field is identical, not merely close. deepEqual on
  // the whole artefact minus the new key is the strongest form of the promise:
  // probabilities, per-batch frequencies, the position heatmap, point
  // summaries, the fixture-impact metric. A tolerance here would let a drifting
  // random stream through, which is the failure this test exists to exclude.
  const { herbstmeister, ...rest } = with_;
  const { herbstmeister: _ignored, ...priorFields } = without;
  assert.deepEqual(rest, priorFields);
  assert.ok(herbstmeister, "and the new field is actually populated");
});

// ---------------------------------------------------------------------------
//  §1 — the tally itself, against hand-computable states.
// ---------------------------------------------------------------------------

/** A four-club league: matchdays 1–3 are the Hinrunde, 4–6 the Rückrunde. */
const MINI = ["A", "B", "C", "D"];
const miniClubs = MINI.map((clubId, i) => ({ clubId, rating: 1700 - i * 40 }));
const miniBase = {
  seasonId: "mini", league: "bl1", clubs: miniClubs, params: P,
  targets: { meister: { places: 1, positions: (r) => r === 1 } },
  runs: 500, batches: 10, herbstmeisterUntilMatchday: 3,
};

/** Apply results to a schedule by fixture id. */
const withResults = (fixtures, results) =>
  fixtures.map((f) => (results[f.id] ? { ...f, gh: results[f.id][0], ga: results[f.id][1] } : f));

test("a decided half-season collapses to the fact — no special path, just no open fixtures", () => {
  const schedule = scheduleRoundRobin(MINI);
  const first = schedule.filter((f) => f.matchday <= 3);
  // Hand-built: B wins all three, so B is Herbstmeister however the Rückrunde
  // turns out. Everything from matchday 4 on stays open and IS simulated.
  const results = {};
  for (const f of first) {
    const bIsHome = f.home === "B";
    const bPlays = bIsHome || f.away === "B";
    results[f.id] = bPlays ? (bIsHome ? [2, 0] : [0, 2]) : [1, 1];
  }
  const art = simulateSeason({ ...miniBase, fixtures: withResults(schedule, results) });

  assert.equal(art.herbstmeister.untilMatchday, 3);
  assert.equal(art.herbstmeister.decided, true, "every fixture up to the anchor is played");
  assert.equal(art.herbstmeister.probabilities.B, 1, "the fact, at probability exactly 1");
  for (const id of ["A", "C", "D"]) assert.equal(art.herbstmeister.probabilities[id], 0);
  assert.equal(art.herbstmeister.sharedProbability, 0);
  // The Rückrunde is still open, so this is genuinely a running simulation and
  // not a degenerate one — the collapse comes from the DATA, not from a branch.
  assert.ok(art.remainingCount > 0);
  assert.ok(art.probabilities.meister.B < 1, "the title is still open although the anchor is not");
});

test("the anchor ranks by the DFL chain, and a genuine tie is a SHARED first place", () => {
  const schedule = scheduleRoundRobin(MINI);
  // A and B each beat the other two 1:0 and draw with each other 0:0. After
  // matchday 3 both stand on 7 points, +2, 2 scored — level on criteria 1) and
  // 2). Criteria 3)–5) need both legs, which the Hinrunde by definition has
  // not played, and criterion 6) never applies in a running season. So the
  // Spielordnung stops, and rank 1 is a geteilter Tabellenplatz.
  const results = {};
  for (const f of schedule.filter((x) => x.matchday <= 3)) {
    const pair = [f.home, f.away].sort().join("");
    if (pair === "AB") results[f.id] = [0, 0];
    else if (["A", "B"].includes(f.home)) results[f.id] = [1, 0];
    else results[f.id] = [0, 1];
  }
  const fixtures = withResults(schedule, results);

  // Verified independently through the ranker, so the test states the premise
  // rather than assuming it.
  const half = fixtures.filter((f) => f.matchday <= 3);
  const ranked = rankTable(buildTable(MINI, half), half, { inSeason: true });
  const leaders = ranked.filter((r) => r.rank === 1).map((r) => r.clubId).sort();
  assert.deepEqual(leaders, ["A", "B"]);
  assert.ok(ranked[0].sharedRank);

  const art = simulateSeason({ ...miniBase, fixtures });
  assert.equal(art.herbstmeister.probabilities.A, 1);
  assert.equal(art.herbstmeister.probabilities.B, 1);
  assert.equal(art.herbstmeister.sharedProbability, 1, "every run reports the shared first place");
  // The documented identity: the sum is the EXPECTED NUMBER of clubs on rank 1,
  // not 1 — that is exactly why sharedProbability ships beside it.
  const sum = Object.values(art.herbstmeister.probabilities).reduce((a, b) => a + b, 0);
  assert.equal(sum, 2);
});

test("an open half-season spreads the probability, and the strongest club leads it", () => {
  const schedule = scheduleRoundRobin(MINI);
  const art = simulateSeason({ ...miniBase, fixtures: schedule });

  assert.equal(art.herbstmeister.decided, false);
  const p = art.herbstmeister.probabilities;
  const sum = Object.values(p).reduce((a, b) => a + b, 0);
  // Σ p = E[#clubs on rank 1] ≥ 1, and the excess is bounded by the shared runs
  // (each contributes at least one extra club, at most three in a four-club
  // league).
  assert.ok(sum >= 1 - 1e-12, `sum ${sum}`);
  assert.ok(sum <= 1 + 3 * art.herbstmeister.sharedProbability + 1e-12, `sum ${sum}`);
  assert.ok(art.herbstmeister.sharedProbability > 0, "ties happen in a four-club half-season");
  assert.ok(p.A > p.D, "the strongest club leads the half-season table most often");
  for (const id of MINI) assert.ok(p[id] > 0 && p[id] < 1);
});

test("the anchor is independent of the champion — they are different questions", () => {
  const schedule = scheduleRoundRobin(MINI);
  const art = simulateSeason({ ...miniBase, fixtures: schedule });
  // Not equality of distributions: a half season is shorter, so the favourite's
  // edge over the field is SMALLER at the anchor than over the full season.
  assert.ok(
    art.herbstmeister.probabilities.A < art.probabilities.meister.A,
    "less football has been played at the anchor, so the favourite is less certain there",
  );
});

// ---------------------------------------------------------------------------
//  §7 — configuration, and failing closed.
// ---------------------------------------------------------------------------

test("no anchor configured means no Herbstmeister — not a guessed matchday 17", () => {
  const art = simulateSeason({ ...miniBase, fixtures: scheduleRoundRobin(MINI), herbstmeisterUntilMatchday: null });
  assert.equal(art.herbstmeister, null);
});

test("an anchor without matchdays fails loudly instead of ranking an empty table", () => {
  const naked = scheduleRoundRobin(MINI).map(({ matchday, ...f }) => f);
  assert.throws(
    () => simulateSeason({ ...miniBase, fixtures: naked }),
    /carries no integer matchday/,
    "a silent empty selection would report a Herbstmeister computed from nothing",
  );
  assert.throws(
    () => simulateSeason({ ...miniBase, fixtures: scheduleRoundRobin(MINI), herbstmeisterUntilMatchday: 0 }),
    /positive integer/,
  );
});

test("every committed season configures the anchor for BOTH leagues (§7b)", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const seasons = fs.readdirSync(path.join(root, "data/seasons")).filter((n) => /^\d{4}$/.test(n));
  assert.ok(seasons.length >= 16, "the historical window is committed");
  for (const year of seasons) {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "data/seasons", year, "config.json"), "utf8"));
    for (const [league, lc] of Object.entries(cfg.leagues)) {
      assert.equal(
        lc.herbstmeisterUntilMatchday, lc.matchdayCount / 2,
        `${year}/${league}: the anchor must be the half of that league's own season, never a constant`,
      );
    }
  }
});
