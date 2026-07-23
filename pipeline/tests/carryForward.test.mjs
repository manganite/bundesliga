import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCarryForward, latestArchivedRating, resolveMissingClubs, groupFixturesByClub,
  MAX_CARRY_FORWARD_DAYS, CARRIED_PROVENANCE,
} from "../src/carryForward.mjs";

const previous = { effectiveAt: "2026-07-03", rating: 2000.87, snapshotId: "clubelo-2026-07-03-abc" };
const base = {
  clubId: "Bayern",
  requestedDate: "2026-07-23",
  carryForwardUntil: "2026-08-15",
  previous,
  clubFixtures: [],
};

// The default is what protects the data: nothing here happens by itself.
test("carry-forward is OFF by default", () => {
  const r = evaluateCarryForward({ ...base, carryForwardUntil: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /off \(no --carry-forward-until\)/);
});

test("with the switch set and no obstacle, the last rating stands in", () => {
  const r = evaluateCarryForward(base);
  assert.equal(r.ok, true);
  assert.equal(r.rating, 2000.87);
  assert.equal(r.ageDays, 20);
  assert.equal(r.provenance, CARRIED_PROVENANCE);
});

// §5.3: the carried entry keeps the real date of the rating it came from.
test("effectiveAt is never rewritten", () => {
  const r = evaluateCarryForward(base);
  assert.equal(r.effectiveAt, "2026-07-03", "the stale date must survive, not be laundered into today");
  assert.equal(r.snapshotId, previous.snapshotId);
});

test("the switch is time-boxed — past its date the club is unresolved again", () => {
  const r = evaluateCarryForward({ ...base, requestedDate: "2026-08-16" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /after --carry-forward-until/);
});

// The pipeline sees only league fixtures. It cannot see the DFB-Pokal or
// European qualifying, and European qualifying runs in July — so the rule must
// expire whatever the operator set.
test("the 42-day ceiling refuses regardless of the flag", () => {
  assert.equal(MAX_CARRY_FORWARD_DAYS, 42);
  const far = evaluateCarryForward({
    ...base,
    requestedDate: "2026-09-01",
    carryForwardUntil: "2026-12-31", // the operator asked for much longer
  });
  assert.equal(far.ok, false);
  assert.match(far.reason, /past the 42-day ceiling/);

  // Exactly at the ceiling still passes; one day beyond does not.
  const at = evaluateCarryForward({ ...base, requestedDate: "2026-08-14", carryForwardUntil: "2026-12-31" });
  assert.equal(at.ageDays, 42);
  assert.equal(at.ok, true);
  const beyond = evaluateCarryForward({ ...base, requestedDate: "2026-08-15", carryForwardUntil: "2026-12-31" });
  assert.equal(beyond.ok, false);
});

test("a known fixture in the gap refuses even with the flag", () => {
  const r = evaluateCarryForward({
    ...base,
    clubFixtures: [{ kickoff: "2026-07-10T18:30:00Z" }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /known fixture\(s\) fall between/);

  // A fixture outside the window is irrelevant.
  const before = evaluateCarryForward({ ...base, clubFixtures: [{ kickoff: "2026-07-01T18:30:00Z" }] });
  assert.equal(before.ok, true);
  const after = evaluateCarryForward({ ...base, clubFixtures: [{ kickoff: "2026-08-01T18:30:00Z" }] });
  assert.equal(after.ok, true);
});

test("without a prior snapshot nothing is invented", () => {
  const r = evaluateCarryForward({ ...base, previous: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no earlier snapshot/);
});

test("a rating newer than the requested date is refused rather than used", () => {
  const r = evaluateCarryForward({ ...base, requestedDate: "2026-07-01" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /newer than/);
});

// ---------------------------------------------------------------------------

const snapshots = {
  s1: { ratings: { Bayern: 1990, Dortmund: 1830 } },
  s2: { ratings: { Dortmund: 1834 } }, // Bayern already absent here
};
const index = {
  snapshots: [
    { snapshotId: "s1", effectiveAt: "2026-07-03", observedAt: "2026-07-03T04:00:00.000Z" },
    { snapshotId: "s2", effectiveAt: "2026-07-20", observedAt: "2026-07-20T04:00:00.000Z" },
  ],
};
const loadSnapshot = async (id) => snapshots[id];

test("the archive lookup finds the most recent snapshot that actually has the club", async () => {
  const bayern = await latestArchivedRating({ clubId: "Bayern", date: "2026-07-23", index, loadSnapshot });
  assert.equal(bayern.effectiveAt, "2026-07-03", "s2 has no Bayern, so it must fall through to s1");
  assert.equal(bayern.rating, 1990);

  const dortmund = await latestArchivedRating({ clubId: "Dortmund", date: "2026-07-23", index, loadSnapshot });
  assert.equal(dortmund.effectiveAt, "2026-07-20");

  assert.equal(await latestArchivedRating({ clubId: "Unbekannt", date: "2026-07-23", index, loadSnapshot }), null);
});

test("resolution is per club — one carried club does not carry the others", async () => {
  const { carried, stillMissing } = await resolveMissingClubs({
    missingClubIds: ["Bayern", "Unbekannt"],
    requestedDate: "2026-07-23",
    carryForwardUntil: "2026-08-15",
    index,
    loadSnapshot,
  });
  assert.equal(carried.length, 1);
  assert.equal(carried[0].clubId, "Bayern");
  assert.equal(stillMissing.length, 1);
  assert.equal(stillMissing[0].clubId, "Unbekannt");
});

test("without the switch every missing club stays missing", async () => {
  const { carried, stillMissing } = await resolveMissingClubs({
    missingClubIds: ["Bayern"],
    requestedDate: "2026-07-23",
    carryForwardUntil: null,
    index,
    loadSnapshot,
  });
  assert.deepEqual(carried, []);
  assert.equal(stillMissing.length, 1);
});

test("fixtures are grouped by club for the intervening-fixture check", () => {
  const grouped = groupFixturesByClub([
    { id: "a", homeClubId: "X", awayClubId: "Y", kickoff: "2026-08-01T00:00:00Z" },
    { id: "b", homeClubId: "Y", awayClubId: "Z", kickoff: "2026-08-08T00:00:00Z" },
  ]);
  assert.equal(grouped.get("X").length, 1);
  assert.equal(grouped.get("Y").length, 2);
  assert.equal(grouped.get("Z").length, 1);
});
