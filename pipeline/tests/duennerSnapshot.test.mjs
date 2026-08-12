import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  supersedes, findPreMatchSnapshot, findSnapshotOn, findSnapshotAsOf, appendSnapshot, readIndex,
} from "../src/snapshots.mjs";
import { backfillDates, backfillSnapshots } from "../src/update.mjs";
import { buildPreMatchDataset } from "../src/preMatch.mjs";

// ============================================================================
//  A thin snapshot is worse than no snapshot.
//
//  Measured on 2026-08-11 against the committed archive: three fixtures of the
//  first BL2 matchday were forecast from a FIVE-club snapshot while a 34-club
//  snapshot for the same date sat beside it in the archive, and a fourth ran on
//  a 30-club one where 34 existed
//  (docs/verification/pipeline-ausfallverhalten.md §3).
//
//  Two causes, one after the other:
//    * `runUpdate` backfilled TODAY, a date the daily CSV covers completely in
//      the same run — dozens of per-club history calls where one request would
//      do, and a partial result when clubelo's history endpoints are flaky.
//    * Both writes carried the same `observedAt` to the millisecond, so the
//      „later observation wins" rule could not separate them and the answer
//      fell through to array order.
//
//  These tests are the weekend constellation itself, kept as the regression.
// ============================================================================

const entry = (o) => ({ source: "clubelo", correctionOf: null, ...o });

const THIN = entry({
  snapshotId: "clubelo-2026-08-08-2ba68be51ddc3bdc",
  observedAt: "2026-08-08T08:28:03.291Z",
  effectiveAt: "2026-08-08",
  clubs: 5,
});
const FULL = entry({
  snapshotId: "clubelo-2026-08-08-a1c94ab421f25116",
  observedAt: "2026-08-08T08:28:03.291Z",   // identical, same run wrote both
  effectiveAt: "2026-08-08",
  clubs: 34,
});

test("same instant, more clubs wins — and not because of array order", () => {
  assert.equal(supersedes(FULL, THIN), true);
  assert.equal(supersedes(THIN, FULL), false);

  // The bug was order-dependence, so both orders have to give the same answer.
  for (const snapshots of [[THIN, FULL], [FULL, THIN]]) {
    const index = { snapshots };
    assert.equal(
      findPreMatchSnapshot(index, "2026-08-09T11:30:00Z").snapshotId, FULL.snapshotId,
      "the pre-match lookup must not depend on insertion order",
    );
    assert.equal(findSnapshotOn(index, "2026-08-08").snapshotId, FULL.snapshotId);
    assert.equal(findSnapshotAsOf(index, "2026-08-10").snapshotId, FULL.snapshotId);
  }
});

test("a later observation still wins, however few clubs it carries", () => {
  // Club count breaks ties; it must never outrank a genuine correction, which
  // may legitimately shrink (a club leaving the league).
  const correction = entry({
    snapshotId: "clubelo-2026-08-08-cccccccccccccccc",
    observedAt: "2026-08-08T20:00:00.000Z",
    effectiveAt: "2026-08-08",
    clubs: 30,
  });
  assert.equal(supersedes(correction, FULL), true);
  assert.equal(
    findSnapshotOn({ snapshots: [FULL, correction] }, "2026-08-08").snapshotId,
    correction.snapshotId,
  );
});

test("a full tie still resolves the same way every time", () => {
  const a = entry({ snapshotId: "clubelo-2026-08-08-aaaa", observedAt: FULL.observedAt, effectiveAt: "2026-08-08", clubs: 34 });
  const b = entry({ snapshotId: "clubelo-2026-08-08-bbbb", observedAt: FULL.observedAt, effectiveAt: "2026-08-08", clubs: 34 });
  assert.equal(findSnapshotOn({ snapshots: [a, b] }, "2026-08-08").snapshotId, "clubelo-2026-08-08-bbbb");
  assert.equal(findSnapshotOn({ snapshots: [b, a] }, "2026-08-08").snapshotId, "clubelo-2026-08-08-bbbb");
});

test("the backfill never covers today — the daily CSV is that date's authority", () => {
  const fixtures = [
    { matchday: 1, kickoff: "2026-08-07T18:30:00Z" },
    { matchday: 1, kickoff: "2026-08-09T11:30:00Z" },
  ];
  const dates = backfillDates(fixtures, "2026-08-08");
  assert.ok(!dates.includes("2026-08-08"), "today would collide with the daily snapshot of the same run");
  assert.ok(dates.includes("2026-08-06"), "past required dates are still filled");
  assert.ok(dates.every((d) => d < "2026-08-08"));
});

// --- the archiving rule itself -------------------------------------------

const CLUBS = [
  { clubId: "Bayern", clubeloUrlName: "Bayern", elo: 2000 },
  { clubId: "Dortmund", clubeloUrlName: "Dortmund", elo: 1830 },
  { clubId: "Hertha", clubeloUrlName: "Hertha", elo: 1460 },
];

// Long enough to clear MIN_HISTORY_ROWS — clubelo answers HTTP 200 with an
// empty body for an unknown name, so a short history is a mapping error and
// `fetchClubHistory` refuses it.
const historyCsv = (club) => {
  const rows = ["Rank,Club,Country,Level,Elo,From,To"];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 3, 1));
    d.setUTCDate(d.getUTCDate() + i * 3);
    const from = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 2);
    rows.push(`1,${club.clubeloUrlName},GER,1,${club.elo},${from},${d.toISOString().slice(0, 10)}`);
  }
  return rows.join("\n");
};

/** clubelo answers for some clubs and fails for the rest — the flaky window. */
const partialSource = (answering) => async (url) => {
  const name = url.split("/").pop();
  const club = CLUBS.find((c) => c.clubeloUrlName === name);
  if (!club || !answering.includes(club.clubId)) throw new Error(`HTTP 502 for ${url}`);
  return historyCsv(club);
};

test("a backfill that cannot cover every club archives nothing at all", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-thin-"));

  const res = await backfillSnapshots({
    ratingsDir: dir,
    clubs: CLUBS,
    dates: ["2026-08-08"],
    observedAt: "2026-08-08T08:28:03.291Z",
    fetchText: partialSource(["Bayern"]),           // 1 of 3 — the weekend's shape
    delayMs: 0,
  });

  assert.equal(res.appended, 0, "a partial snapshot must not enter the archive");
  const index = await readIndex(dir);
  assert.equal(index.snapshots.length, 0);
  assert.ok(
    res.gaps.some((g) => g.date === "2026-08-08" && /only 1 of 3 clubs/.test(g.reason)),
    "the date stays open, and says why",
  );
});

test("refusing the thin one preserves the fallback to the last complete snapshot", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-fallback-"));

  // A complete earlier snapshot — the step function's last step.
  await appendSnapshot(dir, {
    source: "clubelo",
    observedAt: "2026-08-06T00:30:00.000Z",
    effectiveAt: "2026-08-06",
    ratings: Object.fromEntries(CLUBS.map((c) => [c.clubId, c.elo])),
  });

  await backfillSnapshots({
    ratingsDir: dir, clubs: CLUBS, dates: ["2026-08-08"],
    observedAt: "2026-08-08T08:28:03.291Z", fetchText: partialSource(["Bayern"]), delayMs: 0,
  });

  const index = await readIndex(dir);
  const chosen = findPreMatchSnapshot(index, "2026-08-09T11:30:00Z");
  assert.equal(chosen.effectiveAt, "2026-08-06", "the lookup must reach back to the complete snapshot");
  assert.equal(chosen.clubs, 3);
});

test("a complete backfill is archived exactly as before", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-complete-"));
  const res = await backfillSnapshots({
    ratingsDir: dir, clubs: CLUBS, dates: ["2026-08-08"],
    observedAt: "2026-08-08T08:28:03.291Z",
    fetchText: partialSource(CLUBS.map((c) => c.clubId)),
    delayMs: 0,
  });
  assert.equal(res.appended, 1);
  assert.equal((await readIndex(dir)).snapshots[0].clubs, 3);
});

test("a club clubelo genuinely does not list stays a visible gap, not a quiet fill", async () => {
  // The distinction the finding turned on: an absent club is a real gap, while
  // a thin snapshot only LOOKED like one. Without carry-forward the fixture has
  // no entry, and the dataset says so rather than inventing a rating.
  const index = {
    snapshots: [entry({
      snapshotId: "clubelo-2026-08-08-x", observedAt: "2026-08-08T00:20:00.000Z",
      effectiveAt: "2026-08-08", clubs: 1,
    })],
  };
  const { dataset, created } = await buildPreMatchDataset({
    league: "bl1",
    season: 2026,
    fixtures: [{
      id: "f1", matchday: 1, kickoff: "2026-08-09T11:30:00Z",
      homeClubId: "Bayern", awayClubId: "Dortmund",
    }],
    index,
    loadSnapshot: async () => ({ snapshotId: "clubelo-2026-08-08-x", ratings: { Bayern: 2000 } }),
    existing: null,
    modelVersion: "test",
    createdAt: "2026-08-08T12:00:00.000Z",
    carryForward: null,
  });

  assert.equal(created, 0);
  assert.equal(dataset.entries.length, 0);
  assert.ok(
    dataset.gaps.some((g) => g.fixtureId === "f1" && /Dortmund/.test(g.reason)),
    "the missing club has to be named, not silently substituted",
  );
});
