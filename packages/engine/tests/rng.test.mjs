import test from "node:test";
import assert from "node:assert/strict";
import {
  uniform01, makeKeyBase, normalQuantile, ratingNoise, hashString,
} from "../src/rng.mjs";

test("uniform01 is deterministic and strictly inside (0,1)", () => {
  const k = makeKeyBase({ seasonId: "2026", id: "m1", drawKind: "scoreline" });
  for (let run = 0; run < 5000; run++) {
    const u = uniform01(k, run);
    assert.ok(u > 0 && u < 1, `u out of range at run ${run}: ${u}`);
    assert.equal(u, uniform01(k, run), "not reproducible");
  }
});

// The acceptance criterion that rules out a stream-based sampler: raising the
// run count must EXTEND the sample, never resample it (§3 — runCount is
// deliberately absent from the random key).
test("extending the run count leaves the first N draws bit-identical", () => {
  const k = makeKeyBase({ seasonId: "2026", id: "m1", drawKind: "scoreline" });
  const short = Array.from({ length: 1000 }, (_, i) => uniform01(k, i));
  const long = Array.from({ length: 20000 }, (_, i) => uniform01(k, i));
  assert.deepEqual(long.slice(0, 1000), short);
});

test("different fixtures, clubs, draw kinds and contexts give independent streams", () => {
  const base = { seasonId: "2026", id: "m1", drawKind: "scoreline" };
  const variants = [
    makeKeyBase(base),
    makeKeyBase({ ...base, id: "m2" }),
    makeKeyBase({ ...base, drawKind: "noise" }),
    makeKeyBase({ ...base, seasonId: "2025" }),
    // §6: the play-off lives in its own namespace so its draws can never
    // collide with league draws.
    makeKeyBase({ ...base, context: "playoff" }),
  ];
  assert.equal(new Set(variants).size, variants.length, "key bases collided");

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      let same = 0;
      for (let r = 0; r < 2000; r++) {
        if (uniform01(variants[i], r) === uniform01(variants[j], r)) same++;
      }
      assert.equal(same, 0, `streams ${i}/${j} overlapped`);
    }
  }
});

test("uniform01 is close to uniform", () => {
  const k = makeKeyBase({ seasonId: "2026", id: "u", drawKind: "x" });
  const N = 200000;
  const buckets = new Array(20).fill(0);
  let sum = 0;
  for (let r = 0; r < N; r++) {
    const u = uniform01(k, r);
    sum += u;
    buckets[Math.min(19, Math.floor(u * 20))]++;
  }
  assert.ok(Math.abs(sum / N - 0.5) < 0.005, `mean off: ${sum / N}`);
  const expected = N / 20;
  for (const [i, b] of buckets.entries()) {
    assert.ok(Math.abs(b - expected) < expected * 0.06, `bucket ${i} skewed: ${b}`);
  }
});

test("normalQuantile matches known values of the standard normal", () => {
  const cases = [
    [0.5, 0],
    [0.975, 1.959963984540054],
    [0.025, -1.959963984540054],
    [0.95, 1.6448536269514722],
    [0.99, 2.3263478740408408],
    [0.001, -3.090232306167813],
  ];
  for (const [p, want] of cases) {
    assert.ok(Math.abs(normalQuantile(p) - want) < 1e-9, `Φ⁻¹(${p}) = ${normalQuantile(p)}`);
  }
});

test("normalQuantile is monotone across a fine grid", () => {
  let prev = -Infinity;
  for (let i = 1; i < 10000; i++) {
    const v = normalQuantile(i / 10000);
    assert.ok(v > prev, `not monotone at ${i}`);
    prev = v;
  }
});

test("ratingNoise reproduces the requested sigma", () => {
  const sigma = 100;
  const N = 100000;
  let sum = 0;
  let sq = 0;
  for (let r = 0; r < N; r++) {
    const k = makeKeyBase({ seasonId: "2026", id: `club${r % 18}`, drawKind: "noise" });
    const x = ratingNoise(k, r, sigma);
    sum += x;
    sq += x * x;
  }
  const mean = sum / N;
  const sd = Math.sqrt(sq / N - mean * mean);
  assert.ok(Math.abs(mean) < 2, `mean ${mean}`);
  assert.ok(Math.abs(sd - sigma) < 2, `sd ${sd}`);
});

test("ratingNoise with sigma 0 is exactly 0", () => {
  const k = makeKeyBase({ seasonId: "2026", id: "c", drawKind: "noise" });
  assert.equal(ratingNoise(k, 7, 0), 0);
});

test("hashString avalanches similar inputs", () => {
  assert.notEqual(hashString("club-1"), hashString("club-2"));
  assert.notEqual(hashString("ab"), hashString("ba"));
});
