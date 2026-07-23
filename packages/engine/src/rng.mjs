// ============================================================================
//  Counter-based deterministic uniforms + inverse CDFs.
//
//  Brief §3 makes this mandatory and rules out the obvious alternative: a
//  stream-based sampler (mulberry32 + Knuth Poisson, as wm2026 uses) consumes a
//  data-dependent number of variates per fixture. Two data states then
//  desynchronise after the first difference, and the common-random-numbers
//  cancellation that SE(Δ) relies on silently evaporates — despite identical
//  seeds. So: no mutable stream state anywhere. Every draw is a pure function of
//  its key.
//
//  Two keys, never one (§3):
//    cache/artefact key = (dataHash, runCount, engineVersion)  — see artefact.mjs
//    random key         = the tuples below, INDEPENDENT of the data state
//
//  Random keys:
//    fixture draw : (seasonId, protocolVersion, runIndex, fixtureId, drawKind)
//    club noise   : (seasonId, protocolVersion, runIndex, clubId)
//    play-off     : the same, plus context="playoff" (§6 dedicated namespace)
//
//  `runCount` is deliberately absent: raising the run count must EXTEND the
//  sample, not resample it, so the first N runs stay bit-identical.
// ============================================================================

/**
 * The scoreline ordering the inverse-CDF maps through, and the structure of the
 * random keys. Bump this — and only this — when either changes. Every artefact
 * records the value it was produced under.
 *
 * Because this value is hashed into every key, a bump changes EVERY draw. Two
 * artefacts produced under different protocol versions are independent samples,
 * not paired ones — comparing them must account for that.
 *
 * 2 — the criterion-6 decider gained its own `drawKind: "decider"` key instead
 *     of reusing the noise key with a mangled run index (v5.7 Part 2.1).
 * 1 — initial.
 */
export const SIMULATION_PROTOCOL_VERSION = 2;

// ---- 32-bit mixing ---------------------------------------------------------

/** murmur3 finalizer — avalanches a 32-bit integer. */
function mix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Fold a string into a 32-bit seed (FNV-1a). Used only to turn the *symbolic*
 * parts of a key (club ids, fixture ids, drawKind, context) into integers once,
 * at setup — never inside the per-run loop.
 */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/** Order-dependent combination of two 32-bit values. */
function combine(a, b) {
  return mix32((Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ (b + 0x165667b1)) >>> 0);
}

/**
 * Build the run-independent half of a random key. Call once per fixture/club at
 * setup; the result is a plain integer that `uniform01` combines with runIndex.
 *
 * @param {object} k
 * @param {string|number} k.seasonId
 * @param {string} [k.context]   e.g. "league" (default) or "playoff" (§6)
 * @param {string} k.id          fixtureId or clubId
 * @param {string} [k.drawKind]  e.g. "scoreline", "leg1", "et", "pens", "noise"
 */
export function makeKeyBase({ seasonId, context = "league", id, drawKind = "" }) {
  // NUL separates the components because it cannot occur in a club or fixture
  // id. A printable separator such as a space would make the key ambiguous:
  // id "a b" with drawKind "c" and id "a" with drawKind "b c" would hash to the
  // same value and silently share a random stream.
  //
  // Written as the ESCAPE SEQUENCE, never as a literal NUL byte — a literal one
  // makes the file binary to grep and every search over it silently misses.
  return hashString(
    `${SIMULATION_PROTOCOL_VERSION}\0${context}\0${seasonId}\0${id}\0${drawKind}`,
  );
}

/**
 * The uniform for one (keyBase, runIndex) pair, in the open interval (0,1).
 *
 * 53 bits, assembled from two independently salted 32-bit mixes: the normal
 * quantile below is used in the tails, where 32-bit resolution would visibly
 * granulate the extremes. Endpoints are excluded so `normalQuantile` and the
 * scoreline lookup can never be handed 0 or 1.
 */
export function uniform01(keyBase, runIndex) {
  const c = combine(keyBase, runIndex >>> 0);
  const hi = mix32(c ^ 0x243f6a88); // 32 bits
  const lo = mix32(c ^ 0xb7e15162) >>> 11; // 21 bits
  // (hi * 2^21 + lo + 0.5) / 2^53  ∈ (0,1)
  return (hi * 2097152 + lo + 0.5) / 9007199254740992;
}

// ---- inverse normal CDF ----------------------------------------------------

// Wichura's AS241 (PPND16). Chosen over Box-Muller because Box-Muller consumes
// two uniforms and returns two variates — stream behaviour, which §3 forbids —
// and over Acklam's approximation because AS241 needs no refinement step to
// reach full double precision (~1e-16 relative).
const A = [
  3.3871328727963666080, 1.3314166789178437745e2, 1.9715909503065514427e3,
  1.3731693765509461125e4, 4.5921953931549871457e4, 6.7265770927008700853e4,
  3.3430575583588128105e4, 2.5090809287301226727e3,
];
const B = [
  1.0, 4.2313330701600911252e1, 6.8718700749205790830e2, 5.3941960214247511077e3,
  2.1213794301586595867e4, 3.9307895800092710610e4, 2.8729085735721942674e4,
  5.2264952788528545610e3,
];
const C = [
  1.42343711074968357734, 4.63033784615654529590, 5.76949722146069140550,
  3.64784832476320460504, 1.27045825245236838258, 2.41780725177450611770e-1,
  2.27238449892691845833e-2, 7.74545014278341407640e-4,
];
const D = [
  1.0, 2.05319162663775882187, 1.67638483018380384940, 6.89767334985100004550e-1,
  1.48103976427480074590e-1, 1.51986665636164571966e-2, 5.47593808499534494600e-4,
  1.05075007164441684324e-9,
];
const E = [
  6.65790464350110377720, 5.46378491116411436990, 1.78482653991729133580,
  2.96560571828504891230e-1, 2.65321895265761230930e-2, 1.24266094738807843860e-3,
  2.71155556874348757815e-5, 2.01033439929228813265e-7,
];
const F = [
  1.0, 5.99832206555887937690e-1, 1.36929880922735805310e-1,
  1.48753612908506148525e-2, 7.86869131145613259100e-4, 1.84631831751005468180e-5,
  1.42151175831644588870e-7, 2.04426310338993978564e-15,
];

const poly = (c, x) => {
  let s = c[c.length - 1];
  for (let i = c.length - 2; i >= 0; i--) s = s * x + c[i];
  return s;
};

/** Φ⁻¹(p) for p ∈ (0,1). */
export function normalQuantile(p) {
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(A, r)) / poly(B, r);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let v;
  if (r <= 5) {
    r -= 1.6;
    v = poly(C, r) / poly(D, r);
  } else {
    r -= 5;
    v = poly(E, r) / poly(F, r);
  }
  return q < 0 ? -v : v;
}

/**
 * A club's rating noise for one run — §3: drawn once per club per run,
 * independent across clubs, representing uncertainty about true strength rather
 * than match-level randomness. It must NOT be redrawn per leg (§6).
 */
export function ratingNoise(keyBase, runIndex, sigma) {
  return sigma === 0 ? 0 : normalQuantile(uniform01(keyBase, runIndex)) * sigma;
}
