// ============================================================================
//  Relegation play-offs (§V2b.1 G1) — the curated record used by the archive
//  season balance („Klassenerhalt über die Relegation").
//
//  Two boundaries per season: `bl1-bl2` (16th of the Bundesliga vs 3rd of the
//  2. Bundesliga) and `bl2-3liga` (16th of the 2. Bundesliga vs 3rd of the
//  3. Liga). `gh`/`ga` are the result AFTER extra time but BEFORE any penalty
//  shoot-out; `winner` is the club in the HIGHER league next season.
//
//  Source: OpenLigaDB `rel/2024`, `rel/2025` (BL1/BL2) as anchors; the rest
//  curated from the dedicated German-Wikipedia SEASON pages (per-entry source).
//  The brief's „only OpenLigaDB" pledge was deliberately widened to „no clubelo;
//  OpenLigaDB + cited Wikipedia season pages" — documented in the file itself.
//  Fail-closed: a malformed or inconsistent entry throws rather than shipping a
//  wrong result (the test enforces this before commit).
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";

export const BOUNDARIES = ["bl1-bl2", "bl2-3liga"];
const DECIDED_BY = new Set(["regular", "extraTime", "awayGoals", "penalties"]);

/** The two clubs and their aggregate goals from the two legs. */
export function aggregateOf(entry) {
  const [a, b] = entry.legs;
  const clubA = a.home; // leg 1 home = leg 2 away
  const clubB = a.away;
  const goalsA = a.gh + b.ga;
  const goalsB = a.ga + b.gh;
  return { clubA, clubB, goalsA, goalsB };
}

/** Validate one boundary entry; throws on any inconsistency (fail-closed). */
export function validateEntry(season, boundary, entry) {
  const where = `relegation ${season}/${boundary}`;
  if (!Array.isArray(entry.legs) || entry.legs.length !== 2) {
    throw new Error(`${where}: expected exactly two legs`);
  }
  if (!DECIDED_BY.has(entry.decidedBy)) {
    throw new Error(`${where}: unknown decidedBy "${entry.decidedBy}"`);
  }
  const { clubA, clubB, goalsA, goalsB } = aggregateOf(entry);
  if (entry.aggregate !== `${goalsA}:${goalsB}`) {
    throw new Error(`${where}: aggregate ${entry.aggregate} ≠ leg sum ${goalsA}:${goalsB}`);
  }
  if (entry.winner !== clubA && entry.winner !== clubB) {
    throw new Error(`${where}: winner "${entry.winner}" is not one of the two clubs`);
  }
  if (entry.loser !== clubA && entry.loser !== clubB) {
    throw new Error(`${where}: loser "${entry.loser}" is not one of the two clubs`);
  }
  if (entry.winner === entry.loser) {
    throw new Error(`${where}: winner and loser are the same club`);
  }
  // The decision method must match the aggregate: decided on goals → the winner
  // has strictly more; decided on away goals or penalties → the aggregate is level.
  const winnerGoals = entry.winner === clubA ? goalsA : goalsB;
  const loserGoals = entry.winner === clubA ? goalsB : goalsA;
  if ((entry.decidedBy === "regular" || entry.decidedBy === "extraTime") && winnerGoals <= loserGoals) {
    throw new Error(`${where}: decided on goals but winner does not lead (${winnerGoals}:${loserGoals})`);
  }
  if ((entry.decidedBy === "awayGoals" || entry.decidedBy === "penalties") && winnerGoals !== loserGoals) {
    throw new Error(`${where}: decided on ${entry.decidedBy} but the aggregate is not level (${winnerGoals}:${loserGoals})`);
  }
  if (!entry.source) throw new Error(`${where}: missing source`);
}

/** Load and fully validate the committed relegation record. */
export async function loadRelegation(dataDir = "data") {
  const raw = JSON.parse(await readFile(path.join(dataDir, "relegation.json"), "utf8"));
  for (const [season, boundaries] of Object.entries(raw.seasons ?? {})) {
    for (const boundary of BOUNDARIES) {
      if (!boundaries[boundary]) throw new Error(`relegation ${season}: missing ${boundary}`);
      validateEntry(season, boundary, boundaries[boundary]);
    }
  }
  return raw;
}

/** The two relegation outcomes for one season, or null if not on record. */
export function relegationForSeason(relegation, season) {
  return relegation.seasons?.[String(season)] ?? null;
}
