import test from "node:test";
import assert from "node:assert/strict";
import { orderWithinSharedRanks } from "../src/lib/season.js";

// ============================================================================
//  Presentation order inside a shared table place (§11, V1.1 addition).
//
//  The one thing that must never happen: a row the ranker DID separate being
//  moved. Everything else here is display polish; that is a correctness claim.
// ============================================================================

const row = (clubId, rank, sharedRank) => ({ clubId, rank, sharedRank });
const pts = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { expected: v }]));
const ids = (t) => t.map((r) => r.clubId);

test("before the first matchday the whole table is one shared place, ordered by expected points", () => {
  const table = ["a", "b", "c", "d"].map((c) => row(c, 1, true));
  const out = orderWithinSharedRanks(table, pts({ a: 40, b: 62, c: 51, d: 78 }));
  assert.deepEqual(ids(out), ["d", "b", "c", "a"]);
  // The rank itself is untouched — it is still one shared place.
  assert.deepEqual(out.map((r) => r.rank), [1, 1, 1, 1]);
  assert.ok(out.every((r) => r.sharedRank));
});

test("separated rows are NEVER moved, however the forecast rates them", () => {
  const table = [row("a", 1, false), row("b", 2, false), row("c", 3, false)];
  // A forecast that completely disagrees with the table must change nothing.
  const out = orderWithinSharedRanks(table, pts({ a: 10, b: 90, c: 50 }));
  assert.deepEqual(ids(out), ["a", "b", "c"]);
});

test("only the block that shares a rank is reordered, and it stays in place", () => {
  const table = [
    row("first", 1, false),
    row("x", 2, true), row("y", 2, true), row("z", 2, true),
    row("last", 5, false),
  ];
  const out = orderWithinSharedRanks(table, pts({ first: 1, x: 30, y: 70, z: 50, last: 99 }));
  assert.deepEqual(ids(out), ["first", "y", "z", "x", "last"]);
});

test("two separate shared blocks do not bleed into each other", () => {
  const table = [
    row("a", 1, true), row("b", 1, true),
    row("c", 3, true), row("d", 3, true),
  ];
  const out = orderWithinSharedRanks(table, pts({ a: 10, b: 20, c: 30, d: 40 }));
  // Each block sorts internally; no row crosses the block boundary.
  assert.deepEqual(ids(out), ["b", "a", "d", "c"]);
});

test("adjacent shared blocks with the SAME rank value cannot exist, but equal ranks are grouped by run", () => {
  // Defensive: a block is a run of consecutive rows with the same rank, so a
  // later block carrying the same rank number is still treated separately.
  const table = [row("a", 2, true), row("b", 2, true), row("c", 4, false), row("d", 2, true), row("e", 2, true)];
  const out = orderWithinSharedRanks(table, pts({ a: 1, b: 2, c: 3, d: 4, e: 5 }));
  assert.deepEqual(ids(out), ["b", "a", "c", "e", "d"]);
});

test("without a forecast nothing is reordered", () => {
  const table = ["a", "b", "c"].map((c) => row(c, 1, true));
  assert.deepEqual(ids(orderWithinSharedRanks(table, null)), ["a", "b", "c"]);
  assert.deepEqual(ids(orderWithinSharedRanks(table, undefined)), ["a", "b", "c"]);
});

test("clubs the forecast does not cover keep their relative order rather than sinking", () => {
  const table = ["a", "b", "c"].map((c) => row(c, 1, true));
  const out = orderWithinSharedRanks(table, pts({ a: 10, c: 90 }));
  // `b` has no expected points; it must not be silently ranked as zero.
  assert.ok(ids(out).includes("b"));
  assert.equal(out.length, 3);
});

test("equal expected points leave the original order intact", () => {
  const table = ["a", "b", "c"].map((c) => row(c, 1, true));
  assert.deepEqual(ids(orderWithinSharedRanks(table, pts({ a: 50, b: 50, c: 50 }))), ["a", "b", "c"]);
});

test("the input table is not mutated", () => {
  const table = ["a", "b"].map((c) => row(c, 1, true));
  const before = ids(table);
  orderWithinSharedRanks(table, pts({ a: 1, b: 2 }));
  assert.deepEqual(ids(table), before);
});

test("a single row on its own rank is passed through untouched", () => {
  const table = [row("solo", 7, false)];
  const out = orderWithinSharedRanks(table, pts({ solo: 3 }));
  assert.equal(out[0], table[0]);
});

// ============================================================================
//  Clinch statements are GUARANTEES. A play-off place makes „nicht mehr
//  möglich" false while it is still reachable, so the play-off places are part
//  of the season configuration and this is the test that holds them there.
// ============================================================================

import { clinched } from "../src/lib/season.js";

const BL1 = {
  pointsForWin: 3,
  pointsForDraw: 1,
  playoffPlaces: [16],
  targets: {
    meister: { places: 1, from: 1, to: 1, label: "Meister" },
    klassenerhalt: { places: 15, from: 1, to: 15, label: "Klassenerhalt" },
    relegationsplatz: { places: 1, from: 16, to: 16, label: "Relegationsplatz" },
    abstieg: { places: 2, from: 17, to: 18, label: "Abstieg" },
  },
};

/**
 * An 18-club season with one matchday left, built so that exactly `above` clubs
 * are already out of reach of the club under test.
 */
function lateSeason({ above }) {
  const clubs = Array.from({ length: 18 }, (_, i) => ({ clubId: `c${i}` }));
  // The club under test is last and can add at most 3 points.
  const pts = clubs.map((_, i) => (i < above ? 60 : 10));
  const table = clubs.map((c, i) => ({ clubId: c.clubId, pts: pts[i], rank: i + 1, sharedRank: false }));
  // One unplayed fixture per club, so every club's ceiling is pts + 3.
  const fixtures = [];
  for (let i = 0; i < 18; i += 2) {
    fixtures.push({ id: `f${i}`, matchday: 34, homeClubId: `c${i}`, awayClubId: `c${i + 1}` });
  }
  return { season: { clubs, fixtures }, table };
}

test("with 15th out of reach but 16th still open, the claim is the play-off, not elimination", () => {
  const { season, table } = lateSeason({ above: 15 });
  const out = clinched(season, table, BL1);
  const doomed = out.filter((d) => d.kind === "eliminated" && d.target.id === "klassenerhalt");
  assert.ok(doomed.length > 0, "the zone must actually be reported as gone");
  assert.ok(doomed.every((d) => d.viaPlayoff), "15th unreachable does not mean relegated — 16th remains");
});

test("with 16th out of reach too, it really is elimination", () => {
  const { season, table } = lateSeason({ above: 16 });
  const out = clinched(season, table, BL1);
  const doomed = out.filter((d) => d.kind === "eliminated" && d.target.id === "klassenerhalt");
  assert.ok(doomed.length > 0);
  assert.ok(doomed.every((d) => d.viaPlayoff === false), "no route is left, so the statement is final");
});

test("a season without a play-off eliminates at 15th, as it did from 1992/93 to 2007/08", () => {
  const { season, table } = lateSeason({ above: 15 });
  const out = clinched(season, table, { ...BL1, playoffPlaces: [] });
  const doomed = out.filter((d) => d.kind === "eliminated" && d.target.id === "klassenerhalt");
  assert.ok(doomed.length > 0);
  assert.ok(doomed.every((d) => d.viaPlayoff === false));
});

test("an absent playoffPlaces field is treated as no play-off, never as an unknown", () => {
  const { season, table } = lateSeason({ above: 15 });
  const { playoffPlaces, ...withoutField } = BL1;
  const out = clinched(season, table, withoutField);
  assert.ok(out.filter((d) => d.kind === "eliminated").every((d) => d.viaPlayoff === false));
});

test("securing a zone is unaffected — that claim never depended on the play-off", () => {
  // A runaway leader: nobody else can still reach its points, so first place is
  // mathematically secured. The play-off places have no bearing on that.
  const { season, table } = lateSeason({ above: 0 });
  table[0].pts = 90;
  const withPlayoff = clinched(season, table, BL1);
  const without = clinched(season, table, { ...BL1, playoffPlaces: [] });
  const meister = withPlayoff.find((d) => d.clubId === "c0");
  assert.equal(meister?.kind, "secured");
  assert.equal(meister?.target.id, "meister");
  assert.deepEqual(withPlayoff, without, "the play-off places must not change a secured claim");
});
