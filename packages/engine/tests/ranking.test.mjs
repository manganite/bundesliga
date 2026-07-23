import test from "node:test";
import assert from "node:assert/strict";
import { buildTable, rankTable, positionRange, CURRENT_SEASON_RULES } from "../src/ranking.mjs";

const order = (ranked) => ranked.map((r) => r.clubId);
const rankOf = (ranked, id) => ranked.find((r) => r.clubId === id).rank;

test("points come first, then goal difference, then goals scored", () => {
  const clubs = ["A", "B", "C"];
  const matches = [
    { home: "A", away: "C", gh: 3, ga: 0 }, // A: 3 pts, +3, 3 gf
    { home: "B", away: "C", gh: 1, ga: 0 }, // B: 3 pts, +1, 1 gf
  ];
  const ranked = rankTable(buildTable(clubs, matches), matches, { inSeason: true });
  assert.deepEqual(order(ranked), ["A", "B", "C"]);
  assert.ok(ranked.every((r) => !r.sharedRank));
});

test("goals scored separates clubs level on points and goal difference", () => {
  const clubs = ["A", "B", "C", "D"];
  const matches = [
    { home: "A", away: "C", gh: 3, ga: 1 }, // A +2, 3 gf
    { home: "B", away: "D", gh: 2, ga: 0 }, // B +2, 2 gf
  ];
  const ranked = rankTable(buildTable(clubs, matches), matches, { inSeason: true });
  assert.deepEqual(order(ranked).slice(0, 2), ["A", "B"]);
});

// ---------------------------------------------------------------------------
// The two rules brief §6 got wrong or omitted. See
// docs/verification/dfl-spielordnung.md.
// ---------------------------------------------------------------------------

test("in-season: before both legs are played, only criteria 1) and 2) apply — the rest share a position", () => {
  // A and B are level on points, goal difference AND goals scored, and have met
  // only once. The Spielordnung stops here: geteilter Tabellenplatz.
  const clubs = ["A", "B", "C", "D"];
  const matches = [
    { home: "A", away: "B", gh: 2, ga: 1 },
    { home: "A", away: "C", gh: 0, ga: 1 },
    { home: "B", away: "D", gh: 2, ga: 1 },
    { home: "B", away: "C", gh: 0, ga: 1 },
    { home: "A", away: "D", gh: 1, ga: 2 },
  ];
  const table = buildTable(clubs, matches);
  const a = table.find((r) => r.clubId === "A");
  const b = table.find((r) => r.clubId === "B");
  assert.equal(a.pts, b.pts, "precondition: level on points");
  assert.equal(a.gd, b.gd, "precondition: level on goal difference");
  assert.equal(a.gf, b.gf, "precondition: level on goals scored");

  const ranked = rankTable(table, matches, { inSeason: true });
  assert.equal(rankOf(ranked, "A"), rankOf(ranked, "B"), "must share the position");
  assert.ok(ranked.find((r) => r.clubId === "A").sharedRank);
  assert.deepEqual(positionRange(ranked, "A"), positionRange(ranked, "B"));

  // Standard competition ranking: the club behind a shared pair skips a place.
  const shared = rankOf(ranked, "A");
  const behind = ranked.filter((r) => r.rank > shared);
  if (behind.length) assert.equal(Math.min(...behind.map((r) => r.rank)), shared + 2);
});

test("in-season: once both legs are played, criteria 3)–5) do apply", () => {
  // Same clubs, now having met twice, still level on points/GD/goals overall.
  // Head-to-head aggregate separates them.
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 3, ga: 0 },
    { home: "B", away: "A", gh: 1, ga: 0 },
  ];
  const table = buildTable(clubs, matches);
  assert.equal(table[0].pts, table[1].pts);
  assert.equal(table[0].gd, -table[1].gd);

  const ranked = rankTable(table, matches, { inSeason: true });
  // A's head-to-head aggregate is 3:1 = +2, so A is ahead — and NOT by
  // head-to-head points, which are level at 3 each. This is exactly the step
  // brief §6 invented and the Spielordnung does not contain.
  assert.deepEqual(order(ranked), ["A", "B"]);
  assert.ok(ranked.every((r) => !r.sharedRank));
});

test("head-to-head aggregate, not head-to-head points, is criterion 3)", () => {
  // Constructed so the two readings disagree: on head-to-head POINTS B leads
  // (one win each is level, but B won the higher-scoring leg is irrelevant) —
  // here A and B each won once, so h2h points are level 3-3, while the
  // aggregate is A 4:1 = +3. Any implementation that ranked by h2h points first
  // would fall through to a different criterion and could order them the other
  // way; the Spielordnung's aggregate puts A first outright.
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 4, ga: 0 },
    { home: "B", away: "A", gh: 1, ga: 0 },
  ];
  const ranked = rankTable(buildTable(clubs, matches), matches, { inSeason: true });
  assert.deepEqual(order(ranked), ["A", "B"]);
});

test("criterion 4): away goals in the direct comparison break a level aggregate", () => {
  // Aggregate level at 2:2. A scored 2 away, B scored 2 away... make it
  // asymmetric: A wins 2:1 at home, B wins 1:0 at home → aggregate A 2:2 B.
  // Away goals in the h2h: A scored 0 away, B scored 1 away → B ahead.
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 2, ga: 1 },
    { home: "B", away: "A", gh: 1, ga: 0 },
  ];
  const table = buildTable(clubs, matches);
  assert.equal(table[0].pts, table[1].pts);
  assert.equal(table[0].gd, table[1].gd);
  assert.equal(table[0].gf, table[1].gf);
  const ranked = rankTable(table, matches, { inSeason: true });
  assert.deepEqual(order(ranked), ["B", "A"]);
});

test("criterion 6) never applies during a running season — clubs share instead", () => {
  // Perfectly symmetric: identical on every criterion including all away goals.
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 1, ga: 1 },
    { home: "B", away: "A", gh: 1, ga: 1 },
  ];
  const ranked = rankTable(buildTable(clubs, matches), matches, {
    inSeason: true,
    decider: () => 0,
  });
  assert.equal(rankOf(ranked, "A"), rankOf(ranked, "B"));
  assert.ok(ranked.every((r) => r.sharedRank));
});

test("after the season the decider stands in for criterion 6)", () => {
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 1, ga: 1 },
    { home: "B", away: "A", gh: 1, ga: 1 },
  ];
  const table = buildTable(clubs, matches);
  const keys = { A: 0.9, B: 0.1 };
  const ranked = rankTable(table, matches, { inSeason: false, decider: (id) => keys[id] });
  assert.deepEqual(order(ranked), ["B", "A"]);
  assert.ok(ranked.every((r) => !r.sharedRank));

  // Same table, opposite draw — the stand-in is the only thing that moved.
  const flipped = rankTable(table, matches, { inSeason: false, decider: (id) => -keys[id] });
  assert.deepEqual(order(flipped), ["A", "B"]);
});

test("without a decider a final-table tie still shares rather than inventing an order", () => {
  const clubs = ["A", "B"];
  const matches = [
    { home: "A", away: "B", gh: 1, ga: 1 },
    { home: "B", away: "A", gh: 1, ga: 1 },
  ];
  const ranked = rankTable(buildTable(clubs, matches), matches, { inSeason: false });
  assert.equal(rankOf(ranked, "A"), rankOf(ranked, "B"));
});

test("three-way tie narrows through the recomputed mini-table", () => {
  const clubs = ["A", "B", "C", "D"];
  const matches = [
    // A, B, C each beat D once at home and lose there once — keeps D out of it.
    { home: "A", away: "D", gh: 2, ga: 0 },
    { home: "D", away: "A", gh: 0, ga: 2 },
    { home: "B", away: "D", gh: 2, ga: 0 },
    { home: "D", away: "B", gh: 0, ga: 2 },
    { home: "C", away: "D", gh: 2, ga: 0 },
    { home: "D", away: "C", gh: 0, ga: 2 },
    // A cycle among A, B, C: each wins one and loses one, all 1:0.
    { home: "A", away: "B", gh: 1, ga: 0 },
    { home: "B", away: "A", gh: 1, ga: 0 },
    { home: "B", away: "C", gh: 1, ga: 0 },
    { home: "C", away: "B", gh: 1, ga: 0 },
    { home: "C", away: "A", gh: 1, ga: 0 },
    { home: "A", away: "C", gh: 1, ga: 0 },
  ];
  const table = buildTable(clubs, matches);
  const top = table.filter((r) => r.clubId !== "D");
  assert.equal(new Set(top.map((r) => r.pts)).size, 1, "precondition: all level");

  // Fully symmetric cycle: the mini-table cannot separate them, all away goals
  // are level too, so in season they share one position.
  const ranked = rankTable(table, matches, { inSeason: true });
  assert.equal(rankOf(ranked, "A"), rankOf(ranked, "B"));
  assert.equal(rankOf(ranked, "B"), rankOf(ranked, "C"));
  assert.equal(rankOf(ranked, "D"), 4);
});

test("season rules are configuration, not constants — two points for a win", () => {
  const clubs = ["A", "B", "C"];
  const matches = [
    { home: "A", away: "B", gh: 1, ga: 0 },
    { home: "A", away: "C", gh: 1, ga: 0 },
    { home: "B", away: "C", gh: 1, ga: 1 },
  ];
  const twoPoint = { ...CURRENT_SEASON_RULES, pointsForWin: 2 };
  const t3 = buildTable(clubs, matches);
  const t2 = buildTable(clubs, matches, twoPoint);
  assert.equal(t3.find((r) => r.clubId === "A").pts, 6);
  assert.equal(t2.find((r) => r.clubId === "A").pts, 4);
});

test("clubs with no matches still appear — pre-season and off-season tables are complete", () => {
  const clubs = ["A", "B", "C"];
  const table = buildTable(clubs, []);
  assert.equal(table.length, 3);
  assert.ok(table.every((r) => r.played === 0 && r.pts === 0));
  const ranked = rankTable(table, [], { inSeason: true });
  assert.equal(new Set(ranked.map((r) => r.rank)).size, 1, "all share position 1");
});

test("an unknown club in a match is rejected rather than silently ignored", () => {
  assert.throws(() => buildTable(["A"], [{ home: "A", away: "Z", gh: 1, ga: 0 }]), /unknown club/);
});
