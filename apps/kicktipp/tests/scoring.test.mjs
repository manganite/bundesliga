import test from "node:test";
import assert from "node:assert/strict";
import {
  quotaFromPool, scoreTip, bonusFor, tendencyOf,
  MIN_QUOTA_POINTS, MAX_QUOTA_POINTS, MAX_TOTAL_POINTS, EXACT_BONUS, GOAL_DIFFERENCE_BONUS,
} from "../src/scoring.mjs";

test("the quota formula stays inside 3–9", () => {
  for (let t = 1; t <= 100; t++) {
    const q = quotaFromPool(t, 100);
    assert.ok(q >= MIN_QUOTA_POINTS && q <= MAX_QUOTA_POINTS, `T=${t} gave ${q}`);
    assert.ok(Number.isInteger(q));
  }
});

test("a tendency everybody tipped pays the minimum, a rare one the maximum", () => {
  assert.equal(quotaFromPool(100, 100), MIN_QUOTA_POINTS);
  assert.equal(quotaFromPool(1, 100), MAX_QUOTA_POINTS);
  // Monotone: the rarer the pick, the higher the payout.
  let prev = 0;
  for (const t of [90, 70, 50, 30, 20, 12, 5]) {
    const q = quotaFromPool(t, 100);
    assert.ok(q >= prev, `not monotone at T=${t}`);
    prev = q;
  }
});

test("a tendency nobody tipped pays the cap rather than dividing by zero", () => {
  assert.equal(quotaFromPool(0, 100), MAX_QUOTA_POINTS);
  assert.throws(() => quotaFromPool(5, 0), /tipsTotal must be positive/);
});

// ---------------------------------------------------------------------------
// The best-of schema. §11 requires a test asserting no scoreline earns BOTH.
// ---------------------------------------------------------------------------

test("no scoreline ever earns both bonuses", () => {
  for (let th = 0; th <= 6; th++) {
    for (let ta = 0; ta <= 6; ta++) {
      for (let oh = 0; oh <= 8; oh++) {
        for (let oa = 0; oa <= 8; oa++) {
          const bonus = bonusFor({ home: th, away: ta }, { home: oh, away: oa });
          assert.ok(
            bonus === 0 || bonus === GOAL_DIFFERENCE_BONUS || bonus === EXACT_BONUS,
            `tip ${th}:${ta} vs ${oh}:${oa} produced ${bonus} — the tiers must be best-of, never stacked`,
          );
        }
      }
    }
  }
});

test("the maximum possible score is 11, never 12", () => {
  let max = 0;
  for (let th = 0; th <= 6; th++) {
    for (let ta = 0; ta <= 6; ta++) {
      for (let oh = 0; oh <= 8; oh++) {
        for (let oa = 0; oa <= 8; oa++) {
          max = Math.max(max, scoreTip({ home: th, away: ta }, { home: oh, away: oa }, MAX_QUOTA_POINTS));
        }
      }
    }
  }
  assert.equal(max, MAX_TOTAL_POINTS, "stacking would allow 12 and contradict the official header");
});

test("a win: exact pays +2, correct goal difference pays +1", () => {
  const tip = { home: 2, away: 0 };
  assert.equal(scoreTip(tip, { home: 2, away: 0 }, 5), 5 + EXACT_BONUS);
  assert.equal(scoreTip(tip, { home: 3, away: 1 }, 5), 5 + GOAL_DIFFERENCE_BONUS);
  assert.equal(scoreTip(tip, { home: 1, away: 0 }, 5), 5, "right tendency, wrong difference");
  assert.equal(scoreTip(tip, { home: 0, away: 1 }, 5), 0, "wrong tendency scores nothing");
});

// The asymmetry that flips real cases.
test("a draw has NO goal-difference tier — only the exact result pays a bonus", () => {
  const tip = { home: 1, away: 1 };
  assert.equal(scoreTip(tip, { home: 1, away: 1 }, 6), 6 + EXACT_BONUS);
  // 2:2 is the same goal difference as 1:1, but a draw carries no such tier.
  assert.equal(scoreTip(tip, { home: 2, away: 2 }, 6), 6);
  assert.equal(bonusFor(tip, { home: 2, away: 2 }), 0);
  assert.equal(bonusFor(tip, { home: 0, away: 0 }), 0);
});

test("tendencies are labelled correctly", () => {
  assert.equal(tendencyOf(2, 1), "homeWin");
  assert.equal(tendencyOf(1, 1), "draw");
  assert.equal(tendencyOf(0, 2), "awayWin");
});
