import test from "node:test";
import assert from "node:assert/strict";
import { pausedTimelineMatchday } from "../src/lib/season.js";

// ============================================================================
//  The paused-curve note (AUDIT_FAMILIE §2).
//
//  A timeline point needs EVERY match up to its matchday, so a postponement
//  pauses the curve. §7: the sentence renders in the case it describes and
//  nowhere else — and the case it must NOT be confused with is an ordinary
//  matchday in progress, which looks identical to a pure completeness check.
// ============================================================================

const fx = (id, matchday, played) => ({
  id, matchday, kickoff: "2026-08-08T15:30:00Z", homeClubId: "A", awayClubId: "B",
  ...(played ? { gh: 1, ga: 0 } : {}),
});

test("a postponed match with later matchdays played names the blocking matchday", () => {
  const fixtures = [
    fx("a", 1, true), fx("b", 1, false), // one open on matchday 1
    fx("c", 2, true), fx("d", 2, true),
    fx("e", 3, true), fx("f", 3, true),
  ];
  assert.equal(pausedTimelineMatchday(fixtures), 1);
});

test("an ordinary matchday in progress is NOT a postponement", () => {
  const fixtures = [
    fx("a", 1, true), fx("b", 1, false), // Saturday afternoon, rest to come
    fx("c", 2, false), fx("d", 2, false),
  ];
  assert.equal(pausedTimelineMatchday(fixtures), null, "no later matchday has results — nothing is being held back");
});

test("a complete season is not paused", () => {
  const fixtures = [fx("a", 1, true), fx("b", 1, true), fx("c", 2, true), fx("d", 2, true)];
  assert.equal(pausedTimelineMatchday(fixtures), null);
});

test("before the season nothing is paused", () => {
  const fixtures = [fx("a", 1, false), fx("b", 1, false)];
  assert.equal(pausedTimelineMatchday(fixtures), null);
  assert.equal(pausedTimelineMatchday([]), null);
});

test("the blocking matchday is the FIRST incomplete one, not the latest", () => {
  const fixtures = [
    fx("a", 1, true), fx("b", 1, false),
    fx("c", 2, true), fx("d", 2, false),
    fx("e", 3, true), fx("f", 3, true),
  ];
  assert.equal(pausedTimelineMatchday(fixtures), 1);
});
