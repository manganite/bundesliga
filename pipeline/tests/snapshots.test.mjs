import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendSnapshot, readIndex, readSnapshot, findPreMatchSnapshot, provenanceFor,
  contentHash, SNAPSHOT_DIR,
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
