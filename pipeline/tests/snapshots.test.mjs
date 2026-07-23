import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendSnapshot, readIndex, readSnapshot, findPreMatchSnapshot, provenanceFor,
  contentHash, SNAPSHOT_DIR, resolveArchiveBase, createSnapshotStore, ARCHIVE_BASE_ENV,
} from "../src/snapshots.mjs";

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), "bl-snap-"));

test("a snapshot carries observedAt and effectiveAt, and no global phase field", async () => {
  const dir = await tmpDir();
  const { snapshotId } = await appendSnapshot(dir, {
    source: "clubelo",
    observedAt: "2026-08-27T04:00:00.000Z",
    effectiveAt: "2026-08-27",
    ratings: { Bayern: 2000.9, Dortmund: 1834.8 },
  });
  const snap = await readSnapshot(dir, snapshotId);
  assert.equal(snap.observedAt, "2026-08-27T04:00:00.000Z");
  assert.equal(snap.effectiveAt, "2026-08-27");
  assert.equal(snap.phase, undefined, "a global phase field is ambiguous and must not exist");
  assert.deepEqual(snap.ratings, { Bayern: 2000.9, Dortmund: 1834.8 });
});

test("re-running with identical data appends nothing", async () => {
  const dir = await tmpDir();
  const payload = {
    source: "clubelo",
    observedAt: "2026-08-27T04:00:00.000Z",
    effectiveAt: "2026-08-27",
    ratings: { Bayern: 2000.9 },
  };
  const first = await appendSnapshot(dir, payload);
  assert.equal(first.appended, true);

  // Same data, a later run — the observedAt differs, the content does not.
  const second = await appendSnapshot(dir, { ...payload, observedAt: "2026-08-27T06:00:00.000Z" });
  assert.equal(second.appended, false);
  assert.equal(second.snapshotId, first.snapshotId);

  const index = await readIndex(dir);
  assert.equal(index.snapshots.length, 1, "history must not duplicate");
  const files = await fs.readdir(path.join(dir, SNAPSHOT_DIR));
  assert.equal(files.length, 1);
});

test("a correction is appended, never an edit — the earlier snapshot keeps its content", async () => {
  const dir = await tmpDir();
  const a = await appendSnapshot(dir, {
    source: "clubelo", observedAt: "2026-08-27T04:00:00.000Z", effectiveAt: "2026-08-27",
    ratings: { Bayern: 2000.9 },
  });
  const b = await appendSnapshot(dir, {
    source: "clubelo", observedAt: "2026-08-28T04:00:00.000Z", effectiveAt: "2026-08-27",
    ratings: { Bayern: 2010.0 }, note: "clubelo revised the value",
  });

  assert.equal(b.appended, true);
  assert.notEqual(b.snapshotId, a.snapshotId);
  assert.equal(b.correctionOf, a.snapshotId, "a correction names its predecessor");

  const original = await readSnapshot(dir, a.snapshotId);
  assert.equal(original.ratings.Bayern, 2000.9, "the original must be untouched");
  const corrected = await readSnapshot(dir, b.snapshotId);
  assert.equal(corrected.ratings.Bayern, 2010.0);

  const index = await readIndex(dir);
  assert.equal(index.snapshots.length, 2);
});

test("existing paths keep working as history grows", async () => {
  const dir = await tmpDir();
  const ids = [];
  for (const [i, date] of ["2026-08-20", "2026-08-27", "2026-09-03"].entries()) {
    const r = await appendSnapshot(dir, {
      source: "clubelo", observedAt: `${date}T04:00:00.000Z`, effectiveAt: date,
      ratings: { Bayern: 2000 + i },
    });
    ids.push(r.snapshotId);
  }
  // Every earlier path still resolves to exactly what it always held.
  for (const [i, id] of ids.entries()) {
    assert.equal((await readSnapshot(dir, id)).ratings.Bayern, 2000 + i);
  }
});

test("no temporary files are left behind", async () => {
  const dir = await tmpDir();
  await appendSnapshot(dir, {
    source: "clubelo", observedAt: "2026-08-27T04:00:00.000Z", effectiveAt: "2026-08-27",
    ratings: { Bayern: 2000.9 },
  });
  const top = await fs.readdir(dir);
  const snaps = await fs.readdir(path.join(dir, SNAPSHOT_DIR));
  assert.ok(![...top, ...snaps].some((f) => f.includes(".tmp")), "atomic write must clean up");
});

test("the content hash ignores key order but not values", () => {
  assert.equal(contentHash({ a: 1, b: 2 }), contentHash({ b: 2, a: 1 }));
  assert.notEqual(contentHash({ a: 1, b: 2 }), contentHash({ a: 1, b: 3 }));
});

test("required fields are enforced", async () => {
  const dir = await tmpDir();
  const base = { source: "clubelo", observedAt: "x", effectiveAt: "y", ratings: { a: 1 } };
  for (const key of ["source", "observedAt", "effectiveAt"]) {
    await assert.rejects(() => appendSnapshot(dir, { ...base, [key]: undefined }), new RegExp(key));
  }
  await assert.rejects(() => appendSnapshot(dir, { ...base, ratings: {} }), /ratings are required/);
});

// ---------------------------------------------------------------------------
// pre-match selection
// ---------------------------------------------------------------------------

const index = {
  snapshots: [
    { snapshotId: "s1", effectiveAt: "2026-08-26", observedAt: "2026-08-26T04:00:00.000Z" },
    { snapshotId: "s2", effectiveAt: "2026-08-28", observedAt: "2026-08-28T04:00:00.000Z" },
    { snapshotId: "s3", effectiveAt: "2026-08-30", observedAt: "2026-08-30T04:00:00.000Z" },
  ],
};

test("the pre-match snapshot is the latest one strictly before the kickoff date", () => {
  // A rating stamped with the day of the match may already contain that match's
  // result, so "on or before" would silently leak the outcome into the forecast.
  const chosen = findPreMatchSnapshot(index, "2026-08-28T18:30:00Z");
  assert.equal(chosen.snapshotId, "s1", "the same-day snapshot must not be used");
});

test("no earlier snapshot yields null rather than a plausible substitute", () => {
  assert.equal(findPreMatchSnapshot(index, "2026-08-26T18:30:00Z"), null);
});

test("among snapshots sharing an effectiveAt, the latest observed one wins", () => {
  const withCorrection = {
    snapshots: [
      { snapshotId: "old", effectiveAt: "2026-08-26", observedAt: "2026-08-26T04:00:00.000Z" },
      { snapshotId: "fix", effectiveAt: "2026-08-26", observedAt: "2026-08-27T09:00:00.000Z" },
    ],
  };
  assert.equal(findPreMatchSnapshot(withCorrection, "2026-08-28T18:30:00Z").snapshotId, "fix");
});

test("provenance is a property of the data, not of when the pipeline ran", () => {
  const kickoff = "2026-08-28T18:30:00Z";
  assert.equal(
    provenanceFor({ observedAt: "2026-08-27T04:00:00.000Z" }, kickoff),
    "contemporaneous",
    "fetched before kickoff",
  );
  assert.equal(
    provenanceFor({ observedAt: "2026-09-15T04:00:00.000Z" }, kickoff),
    "backfilled",
    "reconstructed afterwards",
  );
  // The boundary is the kickoff itself: a value observed at kickoff is not
  // pre-match.
  assert.equal(provenanceFor({ observedAt: kickoff }, kickoff), "backfilled");
});

// ---------------------------------------------------------------------------
// v5.7 Part 2.5 — the archive location is configuration, not an assumption.
// clubelo publishes no licence; the operator's answer decides whether this
// archive stays public. That move must be a configuration change, never a
// refactoring, so the path semantics have to be location-independent.
// ---------------------------------------------------------------------------

test("the archive base defaults to data/ratings and is overridable", () => {
  assert.equal(resolveArchiveBase("/repo/data", { env: {} }), path.join("/repo/data", "ratings"));
  assert.equal(
    resolveArchiveBase("/repo/data", { env: { [ARCHIVE_BASE_ENV]: "/elsewhere/archive" } }),
    path.resolve("/elsewhere/archive"),
  );
  // An explicit override beats the environment.
  assert.equal(
    resolveArchiveBase("/repo/data", { env: { [ARCHIVE_BASE_ENV]: "/env" }, override: "/explicit" }),
    path.resolve("/explicit"),
  );
});

test("an archive at a different base produces an identical tree", async () => {
  const payload = [
    { source: "clubelo", observedAt: "2026-08-20T04:00:00.000Z", effectiveAt: "2026-08-20", ratings: { A: 1800, B: 1700 } },
    { source: "clubelo", observedAt: "2026-08-27T04:00:00.000Z", effectiveAt: "2026-08-27", ratings: { A: 1810, B: 1690 } },
  ];

  const build = async (dir) => {
    const store = createSnapshotStore(dir);
    for (const s of payload) await store.append(s);
    const tree = [];
    const walk = async (d, prefix = "") => {
      for (const e of (await fs.readdir(d, { withFileTypes: true })).sort((x, y) => x.name.localeCompare(y.name))) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full, `${prefix}${e.name}/`);
        else tree.push([`${prefix}${e.name}`, await fs.readFile(full, "utf8")]);
      }
    };
    await walk(dir);
    return tree;
  };

  const a = await build(await tmpDir());
  const b = await build(await tmpDir());
  assert.deepEqual(a.map(([n]) => n), b.map(([n]) => n), "same paths");
  assert.deepEqual(a, b, "same paths AND same content — the location leaks nowhere");
  assert.ok(a.some(([n]) => n === "index.json"));
  assert.ok(a.some(([n]) => n.startsWith("snapshots/")));
});

test("the store handle exposes the same semantics as the bare functions", async () => {
  const dir = await tmpDir();
  const store = createSnapshotStore(dir);
  const first = await store.append({
    source: "clubelo", observedAt: "2026-08-20T04:00:00.000Z", effectiveAt: "2026-08-20", ratings: { A: 1800 },
  });
  assert.equal(first.appended, true);
  // Idempotent through the handle, exactly as through the function.
  const again = await store.append({
    source: "clubelo", observedAt: "2026-08-20T09:00:00.000Z", effectiveAt: "2026-08-20", ratings: { A: 1800 },
  });
  assert.equal(again.appended, false);
  assert.equal((await store.readIndex()).snapshots.length, 1);
  assert.equal((await store.read(first.snapshotId)).ratings.A, 1800);
});

// ---------------------------------------------------------------------------
//  findSnapshotOn — which snapshot IS the state of a day.
//
//  The fetch-economy path in update.mjs reads the day's ratings out of the
//  archive instead of asking clubelo again, so picking a SUPERSEDED entry here
//  would quietly compute a forecast from corrected-away values.
// ---------------------------------------------------------------------------

test("the day's snapshot is the one observed last, not the one listed first", async () => {
  const { findSnapshotOn } = await import("../src/snapshots.mjs");
  const index = {
    snapshots: [
      { snapshotId: "clubelo-2026-07-23-aaa", source: "clubelo", effectiveAt: "2026-07-23", observedAt: "2026-07-23T06:00:00.000Z" },
      { snapshotId: "clubelo-2026-07-23-bbb", source: "clubelo", effectiveAt: "2026-07-23", observedAt: "2026-07-23T18:00:00.000Z" },
      { snapshotId: "clubelo-2026-07-24-ccc", source: "clubelo", effectiveAt: "2026-07-24", observedAt: "2026-07-24T06:00:00.000Z" },
    ],
  };
  assert.equal(findSnapshotOn(index, "2026-07-23").snapshotId, "clubelo-2026-07-23-bbb");
  assert.equal(findSnapshotOn(index, "2026-07-24").snapshotId, "clubelo-2026-07-24-ccc");
});

test("a day with no snapshot is null, and another source never stands in", async () => {
  const { findSnapshotOn } = await import("../src/snapshots.mjs");
  const index = {
    snapshots: [
      { snapshotId: "other-2026-07-23", source: "elsewhere", effectiveAt: "2026-07-23", observedAt: "2026-07-23T06:00:00.000Z" },
    ],
  };
  assert.equal(findSnapshotOn(index, "2026-07-22"), null);
  assert.equal(findSnapshotOn(index, "2026-07-23"), null, "a foreign source must not be mistaken for clubelo's");
  assert.equal(findSnapshotOn(index, "2026-07-23", "elsewhere").snapshotId, "other-2026-07-23");
});

test("it agrees with the archive's own ordering after a real correction", async () => {
  const { appendSnapshot, readIndex, findSnapshotOn } = await import("../src/snapshots.mjs");
  const dir = await tmpDir();
  await appendSnapshot(dir, {
    source: "clubelo", observedAt: "2026-07-23T06:00:00.000Z", effectiveAt: "2026-07-23",
    ratings: { A: 1500 },
  });
  const corrected = await appendSnapshot(dir, {
    source: "clubelo", observedAt: "2026-07-23T18:00:00.000Z", effectiveAt: "2026-07-23",
    ratings: { A: 1500, B: 1400 },
  });
  assert.equal(corrected.appended, true);
  assert.equal(findSnapshotOn(await readIndex(dir), "2026-07-23").snapshotId, corrected.snapshotId);
});
