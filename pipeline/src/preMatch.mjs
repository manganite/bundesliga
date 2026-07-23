// ============================================================================
//  Per-fixture pre-match rating dataset (§5.3).
//
//  Records, for every fixture, WHICH rating snapshot counted as its pre-match
//  rating, under WHICH rule, and — decisively — with what PROVENANCE.
//
//  Why provenance exists at all: the brief would otherwise contradict itself. A
//  value fetched after kickoff must never become a pre-match rating, yet the
//  mid-season backfill does exactly that from today's vantage point. Both are
//  true once the two cases are named apart:
//
//    contemporaneous — actually fetched before kickoff. ONLY these may be
//                      presented as „die damalige Prognose".
//    backfilled      — reconstructed later from clubelo's published history.
//                      Valid for RETROSPECTIVE calculation only.
//
//  Model-quality evaluations must never silently pool the two groups. `split()`
//  below exists so the Modellgüte page cannot do it by accident.
//
//  Entries are WRITE-ONCE. A later run never rewrites an existing fixture's
//  entry: a contemporaneous record must not be able to decay into a backfilled
//  one just because the pipeline ran again.
// ============================================================================

import { findPreMatchSnapshot, provenanceFor } from "./snapshots.mjs";

export const PRE_MATCH_RULE = "latest snapshot whose effectiveAt is strictly before the kickoff date";

export class PreMatchError extends Error {}

/**
 * Build (or extend) the pre-match dataset for one league-season.
 *
 * @param {object} input
 * @param {Array} input.fixtures        normalised fixtures, each with id, kickoff, homeClubId, awayClubId
 * @param {object} input.index          the snapshot index
 * @param {(id:string)=>Promise<object>} input.loadSnapshot
 * @param {object} [input.existing]     previously written dataset, preserved as-is
 * @param {string} input.modelVersion
 * @param {string} input.createdAt
 */
export async function buildPreMatchDataset({
  league, season, fixtures, index, loadSnapshot, existing = null, modelVersion, createdAt,
}) {
  const entries = new Map();
  for (const e of existing?.entries ?? []) entries.set(e.fixtureId, e);

  const cache = new Map();
  const load = async (id) => {
    if (!cache.has(id)) cache.set(id, await loadSnapshot(id));
    return cache.get(id);
  };

  const gaps = [];
  let created = 0;

  for (const fx of fixtures) {
    // Write-once: an existing entry is authoritative and is never rewritten.
    if (entries.has(fx.id)) continue;

    const snapMeta = findPreMatchSnapshot(index, fx.kickoff);
    if (!snapMeta) {
      gaps.push({
        fixtureId: fx.id,
        kickoff: fx.kickoff,
        reason: "no snapshot with effectiveAt strictly before the kickoff date",
      });
      continue;
    }

    const snap = await load(snapMeta.snapshotId);
    const eloHome = snap.ratings[fx.homeClubId];
    const eloAway = snap.ratings[fx.awayClubId];
    if (eloHome === undefined || eloAway === undefined) {
      gaps.push({
        fixtureId: fx.id,
        kickoff: fx.kickoff,
        snapshotId: snapMeta.snapshotId,
        reason: `snapshot lacks a rating for ${eloHome === undefined ? fx.homeClubId : fx.awayClubId}`,
      });
      continue;
    }

    entries.set(fx.id, {
      fixtureId: fx.id,
      kickoff: fx.kickoff,
      homeClubId: fx.homeClubId,
      awayClubId: fx.awayClubId,
      ratingSnapshotId: snapMeta.snapshotId,
      rule: PRE_MATCH_RULE,
      provenance: provenanceFor(snapMeta, fx.kickoff),
      createdAt,
      modelVersion,
      eloHome,
      eloAway,
    });
    created++;
  }

  const list = [...entries.values()].sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)) || a.fixtureId.localeCompare(b.fixtureId));

  return {
    // What gets written. It must be a pure function of the inputs: a per-run
    // statistic in here would make the file differ on every run and defeat
    // "commit only on change" (§5.1), which in turn would move dataUpdatedAt
    // and force a deployment every two hours.
    dataset: {
      schemaVersion: 1,
      league,
      season,
      rule: PRE_MATCH_RULE,
      entries: list,
      gaps,
      counts: countByProvenance(list),
    },
    // Run-scoped diagnostics — logged, never persisted.
    created,
  };
}

export function countByProvenance(entries) {
  const out = { contemporaneous: 0, backfilled: 0 };
  for (const e of entries) out[e.provenance] = (out[e.provenance] ?? 0) + 1;
  return out;
}

/**
 * Split a dataset by provenance.
 *
 * Model-quality figures must either be reported separately per group or state
 * which group they rest on (§5.3). Returning two arrays — rather than a filter
 * helper — makes pooling a deliberate act rather than an oversight.
 */
export function split(entries) {
  return {
    contemporaneous: entries.filter((e) => e.provenance === "contemporaneous"),
    backfilled: entries.filter((e) => e.provenance === "backfilled"),
  };
}

/**
 * The label a curve may carry, given what is actually available.
 *
 * The frozen-rating timeline needs a pre-season snapshot per club. Where it is
 * missing and cannot be backfilled the feature does NOT fail — but it must not
 * claim what it does not have: the curve is labelled with its real start, never
 * „Saisonstart-Stärke". It is never silently truncated or back-extrapolated.
 */
export function frozenRatingLabel({ seasonStart, earliestEffectiveAt }) {
  if (!earliestEffectiveAt) {
    return { degraded: true, label: "Eingefrorene Stärke nicht verfügbar", from: null };
  }
  if (earliestEffectiveAt <= seasonStart) {
    return { degraded: false, label: "Prognose mit eingefrorener Saisonstart-Stärke", from: earliestEffectiveAt };
  }
  const d = new Date(`${earliestEffectiveAt}T00:00:00Z`);
  const formatted = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });
  return {
    degraded: true,
    label: `Eingefrorene Stärke ab ${formatted}; frühere Daten nicht verfügbar`,
    from: earliestEffectiveAt,
  };
}
