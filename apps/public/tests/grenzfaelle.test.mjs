import test from "node:test";
import assert from "node:assert/strict";
import { duels, historicalDuels } from "../src/lib/season.js";
import { directDuels } from "../../../packages/engine/src/metrics.mjs";

// ============================================================================
//  Boundary cases of the duel threshold (AUDIT_FAMILIE §4, candidate 4).
//
//  `directDuels` keeps a fixture when BOTH clubs are at θ or above. The
//  equality case — exactly θ — was the untested half of that `>=`, at a rule
//  two pages consume through the same function. The other three candidates of
//  the inventory already had their boundary test; the table naming all four is
//  docs/verification/grenzfaelle.md.
// ============================================================================

const CONFIG = { targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } } };
const THETA = 0.1;

test("exactly θ on both sides QUALIFIES — the rule is at-least, not more-than", () => {
  const fixtures = [{ id: "f1", home: "A", away: "B" }];
  const found = directDuels(fixtures, { meister: { A: THETA, B: THETA } }, THETA);
  assert.equal(found.length, 1, "0,1 is not below 0,1");
  assert.equal(found[0].fixtureId, "f1");
});

test("one hair below θ disqualifies the whole fixture", () => {
  const fixtures = [{ id: "f1", home: "A", away: "B" }];
  const found = directDuels(fixtures, { meister: { A: THETA, B: 0.0999999 } }, THETA);
  assert.deepEqual(found, [], "the threshold binds on BOTH clubs, not on their sum or their max");
});

// The same rule reaches the pages through two different callers. A boundary
// that holds in the engine but not at one of its consumers would be worse than
// no boundary at all, because it would look tested.
test("both consumers of the rule agree at the boundary", () => {
  const probs = { meister: { A: THETA, B: THETA, C: THETA, D: 0.0999999 } };
  const rows = (extra) => [
    { id: "m1", matchday: 1, homeClubId: "A", awayClubId: "B", ...extra() },
    { id: "m2", matchday: 1, homeClubId: "C", awayClubId: "D", ...extra() },
  ];

  const live = duels({ fixtures: rows(() => ({})), clubs: [] }, { probabilities: probs }, CONFIG);
  const archive = historicalDuels(
    { fixtures: rows(() => ({ gh: 1, ga: 0 })), clubs: [] },
    { points: [{ matchday: 0, probabilities: probs }] },
    CONFIG,
  );

  assert.deepEqual(live.map((d) => d.fixtureId), ["m1"]);
  assert.deepEqual(archive.map((d) => d.fixtureId), ["m1"]);
});
