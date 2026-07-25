import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { reconstruct } from "../src/reconstruct.mjs";

// ============================================================================
//  Rating reconstruction (§V2b.1 §1). The step function must read the committed
//  pre-match elo exactly, and — the case the brief singles out — must key the
//  „next match" off the MATCHDAY LABEL, not the calendar date, so a postponed
//  fixture does not shift a club's reconstructed rating.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

test("reconstructs a real season and reads the committed pre-match elo verbatim", () => {
  const matches = read("data/training/results/bl1-2011.json").matches;
  const elo = read("data/ratings/training-elo/bl1-2011.json").ratings;
  const r = reconstruct(matches, elo);

  assert.equal(r.matchdayCount, 34);
  assert.equal(r.clubs.length, 18);

  // Pick a concrete fixture and check the reconstruction returns its exact elo.
  const m = matches.find((x) => x.matchday === 1);
  assert.equal(r.ratingBefore(m.home, 1), elo[m.id].eloHome);
  assert.equal(r.ratingBefore(m.away, 1), elo[m.id].eloAway);

  // Pre-season ratings = every club's matchday-1 pre-match value.
  const pre = r.preSeasonRatings();
  assert.equal(pre.get(m.home), elo[m.id].eloHome);
  assert.equal(pre.size, 18);
});

test("„after matchday N“ is the pre-match value of the matchday-(N+1) fixture", () => {
  const matches = read("data/training/results/bl1-2011.json").matches;
  const elo = read("data/ratings/training-elo/bl1-2011.json").ratings;
  const r = reconstruct(matches, elo);

  const club = r.clubs[0];
  const after3 = r.ratingsAfterMatchday(3);
  assert.equal(after3.get(club), r.ratingBefore(club, 4), "after md3 = pre-match of md4");

  // After the last matchday there is no next fixture → the last pre-match value
  // stands in (the season-end simulation has 0 remaining games).
  const after34 = r.ratingsAfterMatchday(34);
  assert.equal(after34.get(club), r.ratingBefore(club, 34));
});

test("a postponed fixture keeps the MATCHDAY-based next match — not the calendar next", () => {
  // Two clubs, a tiny 3-matchday season. Club A's matchday-2 fixture is played
  // AFTER its matchday-3 fixture (a Nachholspiel). The rating after matchday 1
  // must be the pre-match value of the matchday-2 fixture (by label), even though
  // the matchday-3 fixture happened earlier by date.
  const matches = [
    { id: "f1", matchday: 1, date: "2020-08-01", home: "A", away: "B", homeGoals: 1, awayGoals: 0 },
    { id: "f2", matchday: 1, date: "2020-08-01", home: "C", away: "D", homeGoals: 0, awayGoals: 0 },
    // A's matchday-2 fixture is scheduled late (postponed)…
    { id: "f3", matchday: 2, date: "2020-09-20", home: "A", away: "C", homeGoals: 2, awayGoals: 2 },
    { id: "f4", matchday: 2, date: "2020-08-08", home: "B", away: "D", homeGoals: 1, awayGoals: 1 },
    // …while A's matchday-3 fixture is played BEFORE it, by date.
    { id: "f5", matchday: 3, date: "2020-08-15", home: "A", away: "D", homeGoals: 0, awayGoals: 1 },
    { id: "f6", matchday: 3, date: "2020-08-15", home: "C", away: "B", homeGoals: 3, awayGoals: 0 },
  ];
  const elo = {
    f1: { eloHome: 1500, eloAway: 1400 }, // A before md1 = 1500
    f2: { eloHome: 1450, eloAway: 1350 },
    f3: { eloHome: 1520, eloAway: 1460 }, // A before md2 = 1520  (the Nachholspiel)
    f4: { eloHome: 1390, eloAway: 1340 },
    f5: { eloHome: 1510, eloAway: 1330 }, // A before md3 = 1510  (played earlier by date)
    f6: { eloHome: 1470, eloAway: 1380 },
  };
  const r = reconstruct(matches, elo);

  // After matchday 1, A's rating is the pre-match value of its MATCHDAY-2 fixture
  // (1520) — NOT of its matchday-3 fixture (1510), which was played earlier.
  assert.equal(r.ratingsAfterMatchday(1).get("A"), 1520, "matchday label wins, not the calendar");
  assert.notEqual(r.ratingsAfterMatchday(1).get("A"), 1510);
  // After matchday 2, A = pre-match of matchday 3 (1510).
  assert.equal(r.ratingsAfterMatchday(2).get("A"), 1510);
});

test("fail-closed: a fixture without training-elo throws", () => {
  const matches = [{ id: "f1", matchday: 1, date: "2020-08-01", home: "A", away: "B" }];
  assert.throws(() => reconstruct(matches, {}), /no training-elo for fixture f1/);
});

test("fail-closed: an incomplete season (a club missing a matchday) throws", () => {
  const matches = [
    { id: "f1", matchday: 1, date: "2020-08-01", home: "A", away: "B" },
    { id: "f2", matchday: 2, date: "2020-08-08", home: "A", away: "B" },
    // B is missing matchday… actually both play both; drop one to break it:
  ];
  const elo = { f1: { eloHome: 1, eloAway: 2 }, f2: { eloHome: 3, eloAway: 4 } };
  // Add a stray matchday-3 home game for A only → B has no matchday 3.
  matches.push({ id: "f3", matchday: 3, date: "2020-08-15", home: "A", away: "C" });
  elo.f3 = { eloHome: 5, eloAway: 6 };
  assert.throws(() => reconstruct(matches, elo), /no fixture at matchday 3/);
});
