import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyFixtureCounts, verifyEveryClubHasRating, verifyRatingDirection, verifyAll, VerificationError,
} from "../src/verify.mjs";

const config = { clubCount: 4, matchdayCount: 6 };
const clubs = ["A", "B", "C", "D"];

/** A correct 4-club double round robin: 12 fixtures, 6 matchdays, 2 per day. */
function goodSeason() {
  const rounds = [
    [["A", "B"], ["C", "D"]],
    [["A", "C"], ["D", "B"]],
    [["A", "D"], ["B", "C"]],
    [["B", "A"], ["D", "C"]],
    [["C", "A"], ["B", "D"]],
    [["D", "A"], ["C", "B"]],
  ];
  const fixtures = [];
  rounds.forEach((round, i) => {
    round.forEach(([h, a], j) => {
      fixtures.push({
        id: `m${i}${j}`,
        matchday: i + 1,
        kickoff: `2026-09-0${i + 1}T15:30:00Z`,
        homeClubId: h,
        awayClubId: a,
      });
    });
  });
  return { fixtures };
}

const ratings = { A: 1800, B: 1750, C: 1700, D: 1650 };

test("a well-formed season passes the count gate", () => {
  assert.deepEqual(verifyFixtureCounts(goodSeason(), config), []);
});

test("a truncated fetch is caught", () => {
  const season = goodSeason();
  season.fixtures = season.fixtures.slice(0, 10);
  const problems = verifyFixtureCounts(season, config);
  assert.ok(problems.some((p) => /expected 12 fixtures/.test(p)));
});

test("a duplicated fixture is caught", () => {
  const season = goodSeason();
  season.fixtures.push({ ...season.fixtures[0], id: "dup" });
  const problems = verifyFixtureCounts(season, config);
  assert.ok(problems.some((p) => /duplicate fixture A>B/.test(p)));
});

test("a duplicated fixture id is caught", () => {
  const season = goodSeason();
  season.fixtures[1] = { ...season.fixtures[1], id: season.fixtures[0].id };
  assert.ok(verifyFixtureCounts(season, config).some((p) => /duplicate fixture ids/.test(p)));
});

test("counts come from the season config, not from constants", () => {
  // A 20-club, 38-matchday season is a real historical shape (1991/92).
  const twenty = { clubCount: 20, matchdayCount: 38 };
  const problems = verifyFixtureCounts(goodSeason(), twenty);
  assert.ok(problems.length > 0, "the 4-club season must not validate against a 20-club config");
});

test("every fixture club must have a plausible rating", () => {
  assert.deepEqual(verifyEveryClubHasRating(goodSeason().fixtures, ratings), []);

  const missing = verifyEveryClubHasRating(goodSeason().fixtures, { A: 1800, B: 1750, C: 1700 });
  assert.ok(missing.some((p) => /no rating for D/.test(p)));

  const absurd = verifyEveryClubHasRating(goodSeason().fixtures, { ...ratings, D: 99999 });
  assert.ok(absurd.some((p) => /implausible rating for D/.test(p)));

  const notANumber = verifyEveryClubHasRating(goodSeason().fixtures, { ...ratings, D: "1650" });
  assert.ok(notANumber.some((p) => /non-numeric/.test(p)));
});

// ---------------------------------------------------------------------------
// the pre-match rating direction check
// ---------------------------------------------------------------------------

test("a winner whose rating rose passes", () => {
  const played = [{ id: "m1", kickoff: "2026-09-05T15:30:00Z", homeClubId: "A", awayClubId: "B", gh: 2, ga: 0 }];
  const snapshots = [
    { effectiveAt: "2026-09-04", ratings: { A: 1800, B: 1750 } },
    { effectiveAt: "2026-09-06", ratings: { A: 1812, B: 1738 } },
  ];
  const r = verifyRatingDirection(played, snapshots);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 1);
});

test("a winner whose rating fell is caught — the join is wrong", () => {
  const played = [{ id: "m1", kickoff: "2026-09-05T15:30:00Z", homeClubId: "A", awayClubId: "B", gh: 2, ga: 0 }];
  const snapshots = [
    { effectiveAt: "2026-09-04", ratings: { A: 1800, B: 1750 } },
    { effectiveAt: "2026-09-06", ratings: { A: 1788, B: 1762 } }, // swapped
  ];
  const r = verifyRatingDirection(played, snapshots);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /A won fixture m1/);
});

test("a club that played twice inside the window is skipped, not reported", () => {
  const played = [
    { id: "m1", kickoff: "2026-09-05T15:30:00Z", homeClubId: "A", awayClubId: "B", gh: 2, ga: 0 },
    { id: "m2", kickoff: "2026-09-05T18:30:00Z", homeClubId: "C", awayClubId: "A", gh: 5, ga: 0 },
  ];
  const snapshots = [
    { effectiveAt: "2026-09-04", ratings: { A: 1800, B: 1750, C: 1700 } },
    { effectiveAt: "2026-09-08", ratings: { A: 1770, B: 1740, C: 1740 } },
  ];
  const r = verifyRatingDirection(played, snapshots);
  // A won m1 but also lost m2 in the same window — legitimately lower.
  assert.deepEqual(r.problems, [], "a confounded case must not be reported as a failure");
  assert.ok(r.skipped >= 1);
});

test("draws say nothing about direction and are ignored", () => {
  const played = [{ id: "m1", kickoff: "2026-09-05T15:30:00Z", homeClubId: "A", awayClubId: "B", gh: 1, ga: 1 }];
  const snapshots = [
    { effectiveAt: "2026-09-04", ratings: { A: 1800, B: 1750 } },
    { effectiveAt: "2026-09-06", ratings: { A: 1795, B: 1755 } },
  ];
  const r = verifyRatingDirection(played, snapshots);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checked, 0);
});

test("an empty check reports how many it skipped, so it cannot pass silently", () => {
  const played = [{ id: "m1", kickoff: "2026-09-05T15:30:00Z", homeClubId: "A", awayClubId: "B", gh: 2, ga: 0 }];
  const r = verifyRatingDirection(played, [{ effectiveAt: "2026-09-04", ratings: { A: 1800, B: 1750 } }]);
  assert.equal(r.checked, 0);
  assert.equal(r.skipped, 1, "no post-match snapshot — must be visible as skipped, not as a pass");
});

test("verifyAll collects every problem rather than stopping at the first", () => {
  const season = goodSeason();
  season.fixtures = season.fixtures.slice(0, 8);
  try {
    verifyAll({ season, config, ratings: { A: 1800 }, snapshots: [] });
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof VerificationError);
    assert.ok(e.problems.length > 2, `expected several problems, got ${e.problems.length}`);
    assert.match(e.message, /nothing is written and nothing is committed/);
  }
});

test("verifyAll passes a clean season and reports what the direction check covered", () => {
  const r = verifyAll({ season: goodSeason(), config, ratings, snapshots: [] });
  assert.equal(r.ok, true);
  assert.equal(typeof r.ratingDirection.checked, "number");
});
