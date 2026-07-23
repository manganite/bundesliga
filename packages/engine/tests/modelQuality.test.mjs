import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PROVENANCE_ORDER, PROVENANCE_LABEL, groupByProvenance, qualityByProvenance, provenanceNote,
  ratingAgeDays, ratingFreshness, expectedRank, placementVsExpectation,
} from "../src/modelQuality.mjs";
import { accuracy } from "../src/metrics.mjs";

// ============================================================================
//  §5.3 + Addendum A: three provenances, never silently pooled.
// ============================================================================

const scored = (provenance, n, { hit = true } = {}) =>
  Array.from({ length: n }, () => ({
    provenance,
    prediction: hit
      ? { homeWin: 0.6, draw: 0.25, awayWin: 0.15 }
      : { homeWin: 0.15, draw: 0.25, awayWin: 0.6 },
    actual: "homeWin",
  }));

test("the three provenances are the three the data contract knows", () => {
  assert.deepEqual(PROVENANCE_ORDER, ["contemporaneous", "backfilled", "carried-forward"]);
  for (const p of PROVENANCE_ORDER) assert.ok(PROVENANCE_LABEL[p]?.length > 0);
});

test("a fourth provenance fails loudly instead of vanishing from every figure", () => {
  assert.throws(
    () => groupByProvenance([...scored("contemporaneous", 2), { provenance: "geraten", prediction: {}, actual: "homeWin" }]),
    /unknown provenance/,
  );
  assert.throws(() => groupByProvenance([{ provenance: undefined, prediction: {}, actual: "homeWin" }]), /unknown/);
});

test("every match lands in exactly one group — nothing is dropped", () => {
  const all = [...scored("contemporaneous", 5), ...scored("backfilled", 3), ...scored("carried-forward", 2)];
  const groups = groupByProvenance(all);
  assert.equal(groups.contemporaneous.length + groups.backfilled.length + groups["carried-forward"].length, all.length);
});

test("figures are reported per group AND pooled, with the mix attached", () => {
  const all = [
    ...scored("contemporaneous", 10),
    ...scored("carried-forward", 4, { hit: false }),
  ];
  const q = qualityByProvenance(all);
  assert.equal(q.byProvenance.contemporaneous.accuracy.value, 1);
  assert.equal(q.byProvenance["carried-forward"].accuracy.value, 0);
  assert.equal(q.byProvenance.backfilled.n, 0);
  assert.equal(q.pooled.accuracy.value, 10 / 14);
  assert.deepEqual(q.pooled.mix.map((m) => m.provenance), ["contemporaneous", "carried-forward"]);
  assert.equal(q.pooled.mix[0].n, 10);
});

test("a pooled figure over more than one group always carries a note", () => {
  const q = qualityByProvenance([...scored("contemporaneous", 3), ...scored("backfilled", 2)]);
  assert.ok(q.note, "a mixed figure without a note is exactly the silent pooling §5.3 forbids");
  assert.match(q.note, /3 vor Anstoß geholt/);
  assert.match(q.note, /2 nachträglich rekonstruiert/);
  assert.match(q.note, /nur rückblickend/);
});

test("a single group needs no note — there is nothing to disclose", () => {
  assert.equal(qualityByProvenance(scored("contemporaneous", 5)).note, null);
  assert.equal(provenanceNote([]), null);
  assert.equal(provenanceNote([{ provenance: "backfilled", n: 7, share: 1 }]), null);
});

test("the note names carried-forward as its own group, not as a kind of backfill", () => {
  const q = qualityByProvenance([...scored("contemporaneous", 2), ...scored("carried-forward", 1)]);
  assert.match(q.note, /übertragener älterer Wert/);
  assert.doesNotMatch(q.note, /nachträglich rekonstruiert/);
});

test("the per-group figures agree with the plain metric on the same subset", () => {
  const all = [...scored("contemporaneous", 6), ...scored("backfilled", 4, { hit: false })];
  const q = qualityByProvenance(all);
  assert.deepEqual(q.byProvenance.backfilled.accuracy, accuracy(scored("backfilled", 4, { hit: false })));
});

test("an empty set produces empty figures rather than throwing", () => {
  const q = qualityByProvenance([]);
  assert.equal(q.pooled.n, 0);
  assert.equal(q.note, null);
  for (const p of PROVENANCE_ORDER) assert.equal(q.byProvenance[p].n, 0);
});

// ============================================================================
//  Rating-Aktualität (§4 addendum) — renamed from „Rating-Verzögerung".
// ============================================================================

test("the age is whole days between the rating's effectiveAt and the kickoff", () => {
  assert.equal(ratingAgeDays("2026-08-28", "2026-08-29T18:30:00Z"), 1);
  assert.equal(ratingAgeDays("2026-07-03", "2026-08-29T15:30:00Z"), 57);
  assert.equal(ratingAgeDays("2026-08-29", "2026-08-29T15:30:00Z"), 0, "same day is zero, not one");
});

test("the age ignores the time of day — a rating is dated, not timestamped", () => {
  assert.equal(ratingAgeDays("2026-08-28", "2026-08-29T00:30:00Z"), 1);
  assert.equal(ratingAgeDays("2026-08-28", "2026-08-29T23:30:00Z"), 1);
});

test("an unparseable date yields null rather than a plausible number", () => {
  assert.equal(ratingAgeDays("kein Datum", "2026-08-29T15:30:00Z"), null);
  assert.equal(ratingAgeDays("2026-08-28", "irgendwann"), null);
});

test("freshness is reported per provenance and the mix carries its note", () => {
  const entries = [
    ...Array.from({ length: 30 }, () => ({ provenance: "contemporaneous", effectiveAt: "2026-08-28", kickoff: "2026-08-29T15:30:00Z" })),
    ...Array.from({ length: 4 }, () => ({ provenance: "carried-forward", effectiveAt: "2026-07-03", kickoff: "2026-08-29T15:30:00Z" })),
  ];
  const f = ratingFreshness(entries);
  assert.equal(f.byProvenance.contemporaneous.median, 1);
  assert.equal(f.byProvenance.contemporaneous.n, 30);
  assert.equal(f.byProvenance["carried-forward"].median, 57);
  assert.equal(f.byProvenance["carried-forward"].max, 57);
  assert.equal(f.byProvenance.backfilled.n, 0);
  assert.equal(f.byProvenance.backfilled.median, null, "an empty group is null, never zero");
  assert.ok(f.note, "a mixed freshness figure must disclose the mix");
});

test("the carried-forward group is exactly the one that stands out", () => {
  const entries = [
    { provenance: "contemporaneous", effectiveAt: "2026-08-28", kickoff: "2026-08-29T15:30:00Z" },
    { provenance: "carried-forward", effectiveAt: "2026-07-03", kickoff: "2026-08-29T15:30:00Z" },
  ];
  const f = ratingFreshness(entries);
  assert.ok(f.byProvenance["carried-forward"].median > f.byProvenance.contemporaneous.median * 10);
});

test("an unknown provenance in the pre-match dataset is an error, not a silent skip", () => {
  assert.throws(
    () => ratingFreshness([{ provenance: "irgendwas", effectiveAt: "2026-08-28", kickoff: "2026-08-29T15:30:00Z" }]),
    /unknown provenance/,
  );
});

test("no entries yields nulls, not zeros — zero days would read as perfectly fresh", () => {
  const f = ratingFreshness([]);
  assert.equal(f.all.n, 0);
  assert.equal(f.all.median, null);
  assert.equal(f.note, null);
});

// ============================================================================
//  Platzierung vs Erwartung
// ============================================================================

test("the expected rank is the mean of the placement distribution", () => {
  assert.equal(expectedRank([1, 0, 0]), 1);
  assert.equal(expectedRank([0, 0, 1]), 3);
  assert.equal(expectedRank([0.5, 0, 0.5]), 2);
  assert.ok(Math.abs(expectedRank([0.2, 0.3, 0.5]) - 2.3) < 1e-12);
});

test("an absent or empty distribution is null, never rank 0", () => {
  assert.equal(expectedRank([]), null);
  assert.equal(expectedRank(undefined), null);
  assert.equal(expectedRank([0, 0, 0]), null);
});

test("standing higher than expected is a negative difference, and says so", () => {
  const [row] = placementVsExpectation([
    { clubId: "a", rank: 3, positionDistribution: [0, 0, 0, 0, 0, 0, 0, 1] },
  ]);
  assert.equal(row.expectedRank, 8);
  assert.equal(row.difference, -5);
  assert.equal(row.betterThanExpected, true);
});

test("standing lower than expected is positive", () => {
  const [row] = placementVsExpectation([
    { clubId: "a", rank: 14, positionDistribution: [0, 0, 0, 1] },
  ]);
  assert.equal(row.difference, 10);
  assert.equal(row.betterThanExpected, false);
});

test("a shared table place is carried through, not flattened away", () => {
  const [row] = placementVsExpectation([
    { clubId: "a", rank: 1, sharedRank: true, positionDistribution: [0.5, 0.5] },
  ]);
  assert.equal(row.sharedRank, true);
  assert.equal(row.expectedRank, 1.5);
});

// ============================================================================
//  Against the real committed data.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

test("the current season's pre-match dataset splits into exactly the expected groups", () => {
  const pre = read("data/seasons/2026/bl1/prematch.json");
  const counts = {};
  for (const e of pre.entries) counts[e.provenance] = (counts[e.provenance] ?? 0) + 1;
  for (const p of Object.keys(counts)) {
    assert.ok(PROVENANCE_ORDER.includes(p), `${p} is not a provenance this module knows`);
  }
  assert.ok(counts["carried-forward"] > 0, "the carried-forward group is the one this release had to add");
});

test("the completed season is entirely backfilled — and a figure on it must say so", () => {
  const pre = read("data/seasons/2025/bl1/prematch.json");
  const provenances = new Set(pre.entries.map((e) => e.provenance));
  assert.deepEqual([...provenances], ["backfilled"]);
  // One group, so no note — but the caller still has to name the group itself.
  const q = qualityByProvenance(pre.entries.map((e) => ({
    provenance: e.provenance,
    prediction: { homeWin: 0.4, draw: 0.3, awayWin: 0.3 },
    actual: "homeWin",
  })));
  assert.equal(q.note, null);
  assert.equal(q.mix.length, 1);
  assert.equal(q.mix[0].provenance, "backfilled");
});
