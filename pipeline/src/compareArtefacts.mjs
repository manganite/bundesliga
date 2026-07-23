#!/usr/bin/env node
/**
 * Compare two generations of committed artefacts and decide whether the
 * difference is sampling noise or a behaviour change.
 *
 *   node pipeline/src/compareArtefacts.mjs <oldSeasonsDir> <newSeasonsDir>
 *
 * Run after any change that alters the random streams — above all a bump of
 * `SIMULATION_PROTOCOL_VERSION`. Exits non-zero when the difference is more than
 * sampling explains.
 *
 * WHY THE TWO SAMPLES ARE INDEPENDENT, NOT PAIRED. The protocol version is
 * hashed into every random key, so bumping it changes every draw. Common random
 * numbers therefore do NOT apply across a bump: the artefacts are two
 * independent samples of the same distribution, and
 *
 *     SE(Δ) = √(SE_old² + SE_new²)
 *
 * not the paired SD(Δ_b)/√B that §3 uses for two data states under the SAME
 * protocol. Using the paired formula here would understate SE and manufacture
 * false alarms.
 *
 * WHERE THE STANDARD ERRORS COME FROM.
 *  - Current outlook: from the STORED per-batch target frequencies, exactly as
 *    §3 intends — SE = SD(batch frequencies) / √B.
 *  - Frozen timeline: the timeline artefact stores aggregate probabilities only,
 *    so its SE is the binomial one, √(p(1−p)/runs). Runs are independent, so
 *    this is exact rather than a fallback.
 *
 * WHY NOT A PLAIN 3·SE BOUND PER TARGET. v5.7 Part 2 asked for exactly that, and
 * it cannot be satisfied by any correct implementation: with ~5 000 comparisons,
 * pure noise produces ~14 exceedances of 3·SE by construction. Measured on the
 * protocol 1 → 2 regeneration: 11 exceedances where 13.9 were expected, mean
 * z = 0.0026, SD z = 1.0097 — a textbook N(0,1). A pointwise 3·SE gate would
 * have failed a change that provably did nothing.
 *
 * So the check asks what it actually means, in two parts, both fixed here and
 * reviewable in git rather than chosen after seeing a result:
 *
 *   1. DISTRIBUTIONAL — the z-scores must look like N(0,1): mean near 0, SD near
 *      1, balanced signs, and no more exceedances than chance predicts. This is
 *      what catches a small systematic shift spread over many targets, which no
 *      pointwise bound can see.
 *   2. POINTWISE, MULTIPLICITY-CORRECTED — no single comparison may exceed the
 *      Bonferroni bound z(1 − α/2N). At N ≈ 5 000 that is ≈ 4.4·SE. This is what
 *      catches one wild outlier that the distribution would average away.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { normalQuantile } from "../../packages/engine/src/rng.mjs";

// --- thresholds, fixed ex ante ----------------------------------------------
// Chosen from what the statistics imply, not from the observed result. The
// distributional bounds are deliberately loose enough that ordinary sampling
// passes and tight enough that a systematic shift of a few hundredths of an SE
// across thousands of comparisons does not.
const MAX_ABS_MEAN_Z = 0.05;
const MAX_SD_Z_DEVIATION = 0.10;
const SIGN_BALANCE = [0.45, 0.55];
const MAX_EXCEEDANCE_RATIO = 2.5; // observed #(|z|>3) vs its expectation
const FAMILYWISE_ALPHA = 0.05;

const [, , oldDir, newDir] = process.argv;
if (!oldDir || !newDir) {
  process.stderr.write("usage: node pipeline/src/compareArtefacts.mjs <oldSeasonsDir> <newSeasonsDir>\n");
  process.exit(2);
}

const readJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** SE of a probability estimated from per-batch frequencies. */
function seFromBatches(batchFreqs) {
  const B = batchFreqs.length;
  if (B < 2) return null;
  const m = mean(batchFreqs);
  const variance = batchFreqs.reduce((a, x) => a + (x - m) ** 2, 0) / (B - 1);
  return Math.sqrt(variance) / Math.sqrt(B);
}

/** SE of a proportion from independent runs. */
const seBinomial = (p, runs) => Math.sqrt(Math.max(0, p * (1 - p)) / runs);

/** Two-sided tail probability of the standard normal. */
const tailProbability = (k) => 2 * (1 - cdf(k));
function cdf(x) {
  // Zelen & Severo 26.2.17 — plenty for an expectation count.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

const zScores = [];
const deterministicMoves = [];

function record({ where, target, club, pOld, pNew, seOld, seNew }) {
  const delta = pNew - pOld;
  const se = Math.sqrt((seOld ?? 0) ** 2 + (seNew ?? 0) ** 2);
  if (se === 0) {
    // Both samples were deterministic. A move here is a behaviour change by
    // definition — there is no sampling that could explain it.
    if (delta !== 0) deterministicMoves.push({ where, target, club, pOld, pNew, delta });
    return;
  }
  zScores.push({ where, target, club, pOld, pNew, delta, se, z: delta / se });
}

const seasons = (await fs.readdir(newDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

for (const season of seasons) {
  for (const league of ["bl1", "bl2"]) {
    const oldOutlook = path.join(oldDir, season, league, "outlook.json");
    const newOutlook = path.join(newDir, season, league, "outlook.json");
    if (await exists(oldOutlook) && await exists(newOutlook)) {
      const a = await readJson(oldOutlook);
      const b = await readJson(newOutlook);
      for (const target of Object.keys(b.probabilities)) {
        for (const club of b.clubs) {
          record({
            where: `${season}/${league}/outlook`,
            target,
            club,
            pOld: a.probabilities[target]?.[club] ?? 0,
            pNew: b.probabilities[target][club],
            seOld: seFromBatches(a.batchFrequencies?.[target]?.[club] ?? []),
            seNew: seFromBatches(b.batchFrequencies?.[target]?.[club] ?? []),
          });
        }
      }
    }

    const oldTl = path.join(oldDir, season, league, "timeline-frozen.json");
    const newTl = path.join(newDir, season, league, "timeline-frozen.json");
    if (await exists(oldTl) && await exists(newTl)) {
      const a = await readJson(oldTl);
      const b = await readJson(newTl);
      const oldByMd = new Map(a.points.map((p) => [p.matchday, p]));
      for (const point of b.points) {
        const prev = oldByMd.get(point.matchday);
        if (!prev) continue;
        for (const target of Object.keys(point.probabilities)) {
          for (const [club, pNew] of Object.entries(point.probabilities[target])) {
            const pOld = prev.probabilities[target]?.[club] ?? 0;
            record({
              where: `${season}/${league}/timeline md${point.matchday}`,
              target,
              club,
              pOld,
              pNew,
              seOld: seBinomial(pOld, prev.runs),
              seNew: seBinomial(pNew, point.runs),
            });
          }
        }
      }
    }
  }
}

// --- evaluate ----------------------------------------------------------------
const n = zScores.length;
if (n === 0) {
  process.stderr.write("nothing comparable — refusing to report a pass\n");
  process.exit(1);
}

const z = zScores.map((s) => s.z);
const m = mean(z);
const sd = Math.sqrt(z.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
const positiveShare = z.filter((v) => v > 0).length / n;
const over3 = z.filter((v) => Math.abs(v) > 3).length;
const expectedOver3 = n * tailProbability(3);
const bonferroni = normalQuantile(1 - FAMILYWISE_ALPHA / (2 * n));
const worst = zScores.reduce((a, b) => (Math.abs(b.z) > Math.abs(a.z) ? b : a));

const failures = [];
if (Math.abs(m) > MAX_ABS_MEAN_Z) failures.push(`mittleres z ${m.toFixed(4)} über ${MAX_ABS_MEAN_Z}`);
if (Math.abs(sd - 1) > MAX_SD_Z_DEVIATION) failures.push(`SD z ${sd.toFixed(4)} weicht mehr als ${MAX_SD_Z_DEVIATION} von 1 ab`);
if (positiveShare < SIGN_BALANCE[0] || positiveShare > SIGN_BALANCE[1]) {
  failures.push(`Vorzeichenbilanz ${(positiveShare * 100).toFixed(1)} % außerhalb ${SIGN_BALANCE.map((x) => x * 100).join("–")} %`);
}
if (over3 > MAX_EXCEEDANCE_RATIO * expectedOver3) {
  failures.push(`${over3} Überschreitungen von 3·SE, erwartet ${expectedOver3.toFixed(1)}`);
}
if (Math.abs(worst.z) > bonferroni) {
  failures.push(
    `${worst.where} ${worst.target}/${worst.club}: ${Math.abs(worst.z).toFixed(2)}·SE über der `
      + `multiplizitätskorrigierten Schranke ${bonferroni.toFixed(2)}·SE`,
  );
}
if (deterministicMoves.length) {
  failures.push(`${deterministicMoves.length} deterministische Wahrscheinlichkeit(en) haben sich bewegt`);
}

const report = [
  `Vergleiche mit SE > 0: ${n}   (deterministisch und unverändert: nicht gezählt)`,
  `  mittleres z        ${m.toFixed(4)}      (erwartet 0, Schranke ±${MAX_ABS_MEAN_Z})`,
  `  SD z               ${sd.toFixed(4)}      (erwartet 1, Schranke ±${MAX_SD_Z_DEVIATION})`,
  `  positive Vorzeichen ${(positiveShare * 100).toFixed(1)} %     (erwartet 50 %)`,
  `  |z| > 3            ${over3}          (erwartet ${expectedOver3.toFixed(1)})`,
  `  max |z|            ${Math.abs(worst.z).toFixed(2)}       (Schranke ${bonferroni.toFixed(2)}, Bonferroni bei N=${n})`,
].join("\n");
process.stdout.write(`${report}\n`);

if (failures.length) {
  process.stderr.write(`\nDas ist keine Stichprobenstreuung:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`);
  for (const d of deterministicMoves.slice(0, 10)) {
    process.stderr.write(`  ${d.where} ${d.target}/${d.club}: ${d.pOld} -> ${d.pNew}\n`);
  }
  process.exit(1);
}

process.stdout.write("\nDie Abweichungen sind mit reiner Stichprobenstreuung vereinbar.\n");
