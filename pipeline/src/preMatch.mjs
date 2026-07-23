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
import { CARRIED_PROVENANCE } from "./carryForward.mjs";

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
  carryForward = null,
}) {
  const entries = new Map();
  const metaById = new Map(index.snapshots.map((m) => [m.snapshotId, m]));

  // ENRICHMENT, NOT REWRITING. Write-once protects the provenance DECISION from
  // decaying — a contemporaneous record must never become a backfilled one. It
  // does not forbid recording a fact that was always true: which day the chosen
  // snapshot refers to, and which provenance the snapshot itself yields for this
  // kickoff. Both are pure functions of immutable inputs (the snapshot's own
  // dates and the fixture's kickoff), so neither can decay.
  //
  // They are needed because an entry can be `carried-forward` on account of ONE
  // club while the OTHER club's rating came from the snapshot as normal. Without
  // the snapshot-level provenance that second club's Rating-Aktualität could only
  // be guessed, and §4 figures do not guess.
  for (const e of existing?.entries ?? []) {
    const meta = metaById.get(e.ratingSnapshotId);
    const enriched = { ...e };
    if (meta) {
      if (enriched.snapshotEffectiveAt === undefined) enriched.snapshotEffectiveAt = meta.effectiveAt;
      if (enriched.snapshotProvenance === undefined) {
        enriched.snapshotProvenance = provenanceFor(meta, e.kickoff);
      }
    }
    entries.set(e.fixtureId, enriched);
  }

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
    let eloHome = snap.ratings[fx.homeClubId];
    let eloAway = snap.ratings[fx.awayClubId];
    let provenance = provenanceFor(snapMeta, fx.kickoff);
    const carriedFrom = {};

    // A club clubelo has temporarily stopped listing has no rating in the
    // chosen snapshot. Under the bounded carry-forward rule its last archived
    // value may stand in — and the entry then says so, because a forecast built
    // partly on a stale input has to be distinguishable from one that is not.
    for (const [side, clubId] of [["home", fx.homeClubId], ["away", fx.awayClubId]]) {
      const have = side === "home" ? eloHome : eloAway;
      if (have !== undefined || !carryForward) continue;
      const resolved = await carryForward({ clubId, snapshotEffectiveAt: snapMeta.effectiveAt, fixture: fx });
      if (!resolved) continue;
      if (side === "home") eloHome = resolved.rating;
      else eloAway = resolved.rating;
      carriedFrom[clubId] = { effectiveAt: resolved.effectiveAt, ageDays: resolved.ageDays };
      provenance = CARRIED_PROVENANCE;
    }

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
      snapshotEffectiveAt: snapMeta.effectiveAt,
      // The provenance the SNAPSHOT yields for this kickoff, before any
      // carry-forward. For a club that was not carried this is its provenance;
      // `provenance` above is the entry-level value and turns `carried-forward`
      // as soon as either club was.
      snapshotProvenance: provenanceFor(snapMeta, fx.kickoff),
      rule: PRE_MATCH_RULE,
      provenance,
      ...(Object.keys(carriedFrom).length ? { carriedFrom } : {}),
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
  const out = { contemporaneous: 0, backfilled: 0, [CARRIED_PROVENANCE]: 0 };
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
    // A third group, kept apart for the same reason as the second: a figure
    // resting partly on a stale input is not the same figure as one that does
    // not, and pooling them silently would hide exactly that.
    [CARRIED_PROVENANCE]: entries.filter((e) => e.provenance === CARRIED_PROVENANCE),
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
