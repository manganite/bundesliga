import test from "node:test";
import assert from "node:assert/strict";
import { buildPreMatchDataset, split, countByProvenance, frozenRatingLabel, PRE_MATCH_RULE } from "../src/preMatch.mjs";

const snapshots = {
  early: { snapshotId: "early", ratings: { A: 1800, B: 1700 } },
  late: { snapshotId: "late", ratings: { A: 1820, B: 1690 } },
};
const index = {
  snapshots: [
    { snapshotId: "early", effectiveAt: "2026-08-26", observedAt: "2026-08-26T04:00:00.000Z" },
    { snapshotId: "late", effectiveAt: "2026-09-02", observedAt: "2026-09-02T04:00:00.000Z" },
  ],
};
const loadSnapshot = async (id) => snapshots[id];

const fixtures = [
  { id: "m1", kickoff: "2026-08-28T18:30:00Z", homeClubId: "A", awayClubId: "B" },
  { id: "m2", kickoff: "2026-09-04T18:30:00Z", homeClubId: "B", awayClubId: "A" },
];

const buildRaw = (over = {}) => buildPreMatchDataset({
  league: "bl1",
  season: 2026,
  fixtures,
  index,
  loadSnapshot,
  modelVersion: "track-c-part0-v1",
  createdAt: "2026-09-10T00:00:00.000Z",
  ...over,
});

// Tests read the written dataset plus the run-scoped `created` counter.
const build = async (over = {}) => {
  const { dataset, created } = await buildRaw(over);
  return { ...dataset, created };
};

test("each fixture records the snapshot used and the rule it was valid under", async () => {
  const ds = await build();
  const m1 = ds.entries.find((e) => e.fixtureId === "m1");
  assert.equal(m1.ratingSnapshotId, "early");
  assert.equal(m1.rule, PRE_MATCH_RULE);
  assert.equal(m1.eloHome, 1800);
  assert.equal(m1.eloAway, 1700);
  assert.equal(m1.modelVersion, "track-c-part0-v1");
  assert.equal(m1.createdAt, "2026-09-10T00:00:00.000Z");
});

test("a snapshot observed after kickoff is backfilled, never contemporaneous", async () => {
  const ds = await build();
  // Both snapshots were observed before this run, but relative to their own
  // fixtures: `early` (26 Aug) precedes m1's kickoff (28 Aug) -> contemporaneous.
  assert.equal(ds.entries.find((e) => e.fixtureId === "m1").provenance, "contemporaneous");
  // `late` (2 Sep) precedes m2's kickoff (4 Sep) -> also contemporaneous.
  assert.equal(ds.entries.find((e) => e.fixtureId === "m2").provenance, "contemporaneous");

  // Now the same fixtures, but the snapshots were only fetched much later.
  const lateIndex = {
    snapshots: index.snapshots.map((s) => ({ ...s, observedAt: "2026-12-01T00:00:00.000Z" })),
  };
  const backfilled = await build({ index: lateIndex });
  assert.ok(backfilled.entries.every((e) => e.provenance === "backfilled"));
});

test("an entry is never rewritten once it exists", async () => {
  const first = await build();
  assert.equal(first.created, 2);

  // A later run where every snapshot now looks backfilled must NOT downgrade
  // the contemporaneous records already on disk.
  const lateIndex = {
    snapshots: index.snapshots.map((s) => ({ ...s, observedAt: "2026-12-01T00:00:00.000Z" })),
  };
  const second = await build({ existing: first, index: lateIndex });
  assert.equal(second.created, 0, "nothing new should be created");
  assert.ok(
    second.entries.every((e) => e.provenance === "contemporaneous"),
    "a contemporaneous record must not decay into a backfilled one",
  );
});

test("a fixture with no earlier snapshot becomes a recorded gap, not a guess", async () => {
  const ds = await build({
    fixtures: [{ id: "m0", kickoff: "2026-08-20T18:30:00Z", homeClubId: "A", awayClubId: "B" }],
  });
  assert.equal(ds.entries.length, 0);
  assert.equal(ds.gaps.length, 1);
  assert.match(ds.gaps[0].reason, /strictly before/);
});

test("a snapshot missing one club's rating is a gap, not a partial entry", async () => {
  const ds = await build({
    fixtures: [{ id: "mX", kickoff: "2026-08-28T18:30:00Z", homeClubId: "A", awayClubId: "Z" }],
  });
  assert.equal(ds.entries.length, 0);
  assert.equal(ds.gaps.length, 1);
  assert.match(ds.gaps[0].reason, /lacks a rating for Z/);
});

test("split keeps the provenance groups apart", () => {
  const entries = [
    { fixtureId: "a", provenance: "contemporaneous" },
    { fixtureId: "b", provenance: "backfilled" },
    { fixtureId: "c", provenance: "contemporaneous" },
    // v5.7 Addendum 2.6: a third group, kept apart for the same reason as the
    // second — a figure resting partly on a stale input is not the same figure.
    { fixtureId: "d", provenance: "carried-forward" },
  ];
  const s = split(entries);
  assert.equal(s.contemporaneous.length, 2);
  assert.equal(s.backfilled.length, 1);
  assert.equal(s["carried-forward"].length, 1);
  assert.deepEqual(countByProvenance(entries), {
    contemporaneous: 2, backfilled: 1, "carried-forward": 1,
  });
});

// §5.3: the feature does not fail when the pre-season snapshot is missing — but
// it must not claim what it does not have.
test("the frozen-rating curve is labelled with its real start", () => {
  const atStart = frozenRatingLabel({ seasonStart: "2026-08-28", earliestEffectiveAt: "2026-08-27" });
  assert.equal(atStart.degraded, false);
  assert.match(atStart.label, /Saisonstart-Stärke/);

  const late = frozenRatingLabel({ seasonStart: "2026-08-28", earliestEffectiveAt: "2026-09-12" });
  assert.equal(late.degraded, true);
  assert.match(late.label, /ab 12\. September/);
  assert.doesNotMatch(late.label, /Saisonstart/, "must not claim a start it does not have");

  const none = frozenRatingLabel({ seasonStart: "2026-08-28", earliestEffectiveAt: null });
  assert.equal(none.degraded, true);
  assert.equal(none.from, null);
});

// ---------------------------------------------------------------------------
//  Enrichment of existing entries (V1.2).
//
//  The write-once rule protects the provenance DECISION. Adding a fact that was
//  always true — which day the chosen snapshot refers to, and what provenance
//  that snapshot yields for this kickoff — cannot make a contemporaneous record
//  decay, because both are pure functions of immutable inputs. This test is what
//  keeps that distinction honest: enrichment may ADD, never CHANGE.
// ---------------------------------------------------------------------------

test("an existing entry gains the snapshot fields and loses nothing", async () => {
  const index = {
    snapshots: [
      { snapshotId: "clubelo-2026-08-27-aa", source: "clubelo", effectiveAt: "2026-08-27", observedAt: "2026-08-27T04:00:00.000Z" },
    ],
  };
  const old = {
    fixtureId: "1",
    kickoff: "2026-08-28T18:30:00Z",
    homeClubId: "A",
    awayClubId: "B",
    ratingSnapshotId: "clubelo-2026-08-27-aa",
    rule: "latest snapshot whose effectiveAt is strictly before the kickoff date",
    provenance: "carried-forward",
    carriedFrom: { A: { effectiveAt: "2026-07-03", ageDays: 56 } },
    createdAt: "2026-08-27T05:00:00.000Z",
    modelVersion: "track-c-part0-v1",
    eloHome: 2000,
    eloAway: 1700,
  };

  const { dataset } = await buildPreMatchDataset({
    league: "bl1",
    season: 2026,
    fixtures: [],
    index,
    loadSnapshot: async () => ({ ratings: {} }),
    existing: { entries: [old] },
    modelVersion: "track-c-part0-v1",
    createdAt: "2026-09-01T04:00:00.000Z",
  });

  const [entry] = dataset.entries;
  // Added.
  assert.equal(entry.snapshotEffectiveAt, "2026-08-27");
  assert.equal(entry.snapshotProvenance, "contemporaneous", "observed before kickoff");
  // Unchanged — every original field, byte for byte.
  for (const key of Object.keys(old)) {
    assert.deepEqual(entry[key], old[key], `${key} was rewritten`);
  }
});

test("the entry-level provenance is NOT overwritten by the snapshot-level one", async () => {
  const index = {
    snapshots: [
      { snapshotId: "s1", source: "clubelo", effectiveAt: "2026-08-27", observedAt: "2026-08-27T04:00:00.000Z" },
    ],
  };
  const old = {
    fixtureId: "1", kickoff: "2026-08-28T18:30:00Z", homeClubId: "A", awayClubId: "B",
    ratingSnapshotId: "s1", rule: "r", provenance: "carried-forward",
    carriedFrom: { A: { effectiveAt: "2026-07-03", ageDays: 56 } },
    createdAt: "x", modelVersion: "v", eloHome: 1, eloAway: 2,
  };
  const { dataset } = await buildPreMatchDataset({
    league: "bl1", season: 2026, fixtures: [], index,
    loadSnapshot: async () => ({ ratings: {} }), existing: { entries: [old] },
    modelVersion: "v", createdAt: "y",
  });
  assert.equal(dataset.entries[0].provenance, "carried-forward");
  assert.equal(dataset.entries[0].snapshotProvenance, "contemporaneous");
});

test("enrichment is idempotent — a second run changes nothing", async () => {
  const index = {
    snapshots: [{ snapshotId: "s1", source: "clubelo", effectiveAt: "2026-08-27", observedAt: "2026-08-29T04:00:00.000Z" }],
  };
  const old = {
    fixtureId: "1", kickoff: "2026-08-28T18:30:00Z", homeClubId: "A", awayClubId: "B",
    ratingSnapshotId: "s1", rule: "r", provenance: "backfilled",
    createdAt: "x", modelVersion: "v", eloHome: 1, eloAway: 2,
  };
  const args = {
    league: "bl1", season: 2026, fixtures: [], index,
    loadSnapshot: async () => ({ ratings: {} }), modelVersion: "v", createdAt: "y",
  };
  const first = (await buildPreMatchDataset({ ...args, existing: { entries: [old] } })).dataset;
  assert.equal(first.entries[0].snapshotProvenance, "backfilled", "observed after kickoff");
  const second = (await buildPreMatchDataset({ ...args, existing: first })).dataset;
  assert.deepEqual(second, first, "a second run must produce a byte-identical dataset");
});

// ---------------------------------------------------------------------------
//  Recompute until kickoff, freeze from kickoff on (PREMATCH_FENSTER).
//
//  The defect these pin down: entries were created for EVERY fixture of the
//  season on the first run and then frozen, so a match in May 2027 carried the
//  ratings of July 2026 forever. Model quality would have measured the whole
//  season against one snapshot, unnoticed until the season was over.
// ---------------------------------------------------------------------------

const s1 = { snapshotId: "s1", effectiveAt: "2026-08-26", observedAt: "2026-08-26T04:00:00.000Z" };
const s2 = { snapshotId: "s2", effectiveAt: "2026-09-02", observedAt: "2026-09-02T04:00:00.000Z" };
const ratings = {
  s1: { snapshotId: "s1", ratings: { A: 1800, B: 1700 } },
  s2: { snapshotId: "s2", ratings: { A: 1820, B: 1690 } },
};
// One fixture, kicking off 4 September.
const future = [{ id: "f1", kickoff: "2026-09-04T18:30:00Z", homeClubId: "A", awayClubId: "B" }];

const buildFuture = (over = {}) => buildPreMatchDataset({
  league: "bl1",
  season: 2026,
  fixtures: future,
  index: { snapshots: [s1] },
  loadSnapshot: async (id) => ratings[id],
  modelVersion: "v1",
  createdAt: "2026-08-27T04:00:00.000Z",
  ...over,
});

test("a fixture 60 days out still gets an entry — the app needs it to predict at all", async () => {
  const { dataset } = await buildPreMatchDataset({
    league: "bl1",
    season: 2026,
    fixtures: [{ id: "far", kickoff: "2026-10-26T18:30:00Z", homeClubId: "A", awayClubId: "B" }],
    index: { snapshots: [s1] },
    loadSnapshot: async (id) => ratings[id],
    modelVersion: "v1",
    createdAt: "2026-08-27T04:00:00.000Z",
  });
  assert.equal(dataset.entries.length, 1, "no window: every fixture of the season carries an entry");
  assert.equal(dataset.gaps.length, 0);
  assert.equal(dataset.entries[0].eloHome, 1800, "and it carries usable ratings, not a placeholder");
});

test("before kickoff a newer snapshot replaces the entry", async () => {
  const first = (await buildFuture()).dataset;
  assert.equal(first.entries[0].ratingSnapshotId, "s1");

  const { dataset: second, updated } = await buildFuture({
    existing: first,
    index: { snapshots: [s1, s2] },
    createdAt: "2026-09-03T04:00:00.000Z",
  });
  assert.equal(updated, 1);
  assert.equal(second.entries[0].ratingSnapshotId, "s2", "the better snapshot wins while the match is open");
  assert.equal(second.entries[0].eloHome, 1820);
  assert.equal(second.entries[0].createdAt, "2026-09-03T04:00:00.000Z");
});

test("from kickoff on the entry is frozen, even with a newer snapshot available", async () => {
  const first = (await buildFuture()).dataset;

  const { dataset: second, updated } = await buildFuture({
    existing: first,
    index: { snapshots: [s1, s2] },
    // Now the run happens AFTER the 4 September kickoff.
    createdAt: "2026-09-05T04:00:00.000Z",
  });
  assert.equal(updated, 0);
  assert.deepEqual(second.entries[0], first.entries[0], "a played match keeps the state of knowledge it was played under");
});

test("a carry-forward mark disappears once clubelo lists the club again", async () => {
  const withoutA = { snapshotId: "s1", ratings: { B: 1700 } };
  const carried = (await buildFuture({
    loadSnapshot: async () => withoutA,
    carryForward: async ({ clubId }) => ({ rating: 1999, effectiveAt: "2026-07-03", ageDays: 54, clubId }),
  })).dataset;
  assert.equal(carried.entries[0].provenance, "carried-forward");
  assert.deepEqual(carried.entries[0].carriedFrom, { A: { effectiveAt: "2026-07-03", ageDays: 54 } });

  // clubelo publishes A again, the match has still not kicked off.
  const healed = (await buildFuture({ existing: carried })).dataset;
  assert.equal(healed.entries[0].provenance, "contemporaneous", "the mark is not sticky");
  assert.equal(healed.entries[0].carriedFrom, undefined);
  assert.equal(healed.entries[0].eloHome, 1800);
});

test("NO CHURN — a rerun with unchanged data writes a byte-identical file", async () => {
  const first = (await buildFuture()).dataset;
  // The cron passes a fresh timestamp every two hours. That alone must not move
  // a single byte, or every run commits and deploys an identical file (§5.1).
  const { dataset: second, updated } = await buildFuture({
    existing: first,
    createdAt: "2026-08-27T06:00:00.000Z",
  });
  assert.equal(updated, 0);
  assert.deepEqual(second, first);
  assert.equal(second.entries[0].createdAt, "2026-08-27T04:00:00.000Z", "createdAt must not tick on a no-op rerun");
});

test("DETERMINISM — the kickoff boundary follows the run timestamp, never the clock", async () => {
  const base = (await buildFuture()).dataset;
  const args = { existing: base, index: { snapshots: [s1, s2] } };

  // Same inputs, same as-of: identical output, twice.
  const a = (await buildFuture({ ...args, createdAt: "2026-09-03T04:00:00.000Z" })).dataset;
  const b = (await buildFuture({ ...args, createdAt: "2026-09-03T04:00:00.000Z" })).dataset;
  assert.deepEqual(a, b);

  // Only the as-of moves — and that alone decides open vs frozen.
  const after = (await buildFuture({ ...args, createdAt: "2026-09-05T04:00:00.000Z" })).dataset;
  assert.equal(a.entries[0].ratingSnapshotId, "s2", "before kickoff: rebuilt");
  assert.equal(after.entries[0].ratingSnapshotId, "s1", "after kickoff: frozen");
});

test("a run timestamp that is not a date fails loudly instead of guessing the boundary", async () => {
  await assert.rejects(
    () => buildFuture({ createdAt: "irgendwann" }),
    /must be an ISO timestamp/,
  );
});

test("an entry whose snapshot is no longer in the index is left exactly as it was", async () => {
  const old = {
    fixtureId: "1", kickoff: "2026-08-28T18:30:00Z", homeClubId: "A", awayClubId: "B",
    ratingSnapshotId: "verschwunden", rule: "r", provenance: "contemporaneous",
    createdAt: "x", modelVersion: "v", eloHome: 1, eloAway: 2,
  };
  const { dataset } = await buildPreMatchDataset({
    league: "bl1", season: 2026, fixtures: [], index: { snapshots: [] },
    loadSnapshot: async () => ({ ratings: {} }), existing: { entries: [old] },
    modelVersion: "v", createdAt: "y",
  });
  assert.deepEqual(dataset.entries[0], old, "no snapshot, no invented dates");
});
