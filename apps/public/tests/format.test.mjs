import test from "node:test";
import assert from "node:assert/strict";
import { percent, pp, points, rating, signed, number } from "../src/lib/format.js";

// ============================================================================
//  Number formatting (ZAHLENFORMAT brief). Presentation only.
// ============================================================================

test("percent shows a FIXED single decimal — a column cannot flicker", () => {
  assert.equal(percent(0.05), "5,0 %");
  assert.equal(percent(0.19), "19,0 %");
  assert.equal(percent(0.134), "13,4 %");
  assert.equal(percent(0.5), "50,0 %");
});

test("the edge-value policy is unchanged — a possibility is never shown as impossible", () => {
  assert.equal(percent(0), "0 %");
  assert.equal(percent(1), "100 %");
  assert.equal(percent(0.0004), "<0,1 %");
  assert.equal(percent(0.9999), ">99,9 %");
  assert.equal(percent(null), "–");
  // digits === 0 callers keep their integer form.
  assert.equal(percent(0.5, 0), "50 %");
});

test("pp is the ONE signed percentage-point path, with a real minus", () => {
  assert.equal(pp(0.148), "+14,8 Pp.");
  assert.equal(pp(-0.148), "−14,8 Pp.");
  assert.equal(pp(0), "0,0 Pp.");
  assert.equal(pp(null), "–");
  // The minus is U+2212, never the hyphen-minus.
  assert.ok(pp(-0.1).includes("−"));
  assert.ok(!pp(-0.1).includes("-"));
});

test("points is the UNSIGNED magnitude path — a distance never gets a +", () => {
  assert.equal(points(0.026), "2,6 Pp.");
  assert.equal(points(0.1084), "10,8 Pp.");
  assert.ok(!points(0.05).startsWith("+"));
});

test("rating has no thousands grouping — an Elo is an identifier, not a quantity", () => {
  assert.equal(rating(1678), "1678");
  assert.equal(rating(2000.9), "2001");
  assert.equal(rating(1670.4), "1670");
  assert.equal(rating(null), "–");
  // Never „1.678".
  assert.ok(!rating(1678).includes("."));
});

test("signed uses the real minus consistently", () => {
  assert.equal(signed(12), "+12,0");
  assert.equal(signed(-12), "−12,0");
  assert.equal(signed(12, 0), "+12");
  assert.ok(signed(-5).includes("−"));
});
