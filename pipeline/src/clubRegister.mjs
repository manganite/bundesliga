// ============================================================================
//  Club register (§V2b.1 G3) — the one place that resolves a training-data
//  clubId to a display name and short name.
//
//  The historical seasons carry clubs by their training short-name only
//  („Aue", „1860 München", …); the app needs display names. The register maps
//  every club that appears in BL1/BL2 across 2011/12–2025/26. It is FAIL-CLOSED:
//  an unknown clubId in the historical data aborts artefact generation by name,
//  rather than inventing a label (§5.2 pattern). Names for clubs still active in
//  2025/26 come from the committed season files; names for history-only clubs
//  come from OpenLigaDB (teamId cited per entry), never guessed.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Load and lightly validate the committed register. */
export async function loadClubRegister(dataDir = "data") {
  const raw = JSON.parse(await readFile(path.join(dataDir, "clubs.json"), "utf8"));
  if (!raw?.clubs || typeof raw.clubs !== "object") {
    throw new Error("club register: missing `clubs` map");
  }
  for (const [clubId, entry] of Object.entries(raw.clubs)) {
    // Fail-closed at LOAD, not only in the test suite: every entry needs a name,
    // a short name and a cited source before it can seed an artefact.
    if (!entry?.name || !entry?.shortName || !entry?.source) {
      throw new Error(`club register: entry ${clubId} lacks name/shortName/source`);
    }
  }
  return raw;
}

/**
 * Resolve a clubId to its display name — FAIL-CLOSED. An unknown clubId throws
 * with the name in the message, so a gap in the register stops the run loudly
 * instead of shipping a blank or a guess.
 */
export function resolveClubName(register, clubId) {
  const entry = register.clubs[clubId];
  if (!entry) {
    throw new Error(
      `club register: unknown clubId "${clubId}" — add it to data/clubs.json with a sourced name before generating artefacts`,
    );
  }
  return entry.name;
}

/**
 * Assert every clubId in a set is registered; throws naming ALL missing ones at
 * once (a single failing artefact run should list the whole gap, not the first).
 */
export function assertClubsKnown(register, clubIds) {
  const missing = [...new Set(clubIds)].filter((id) => !register.clubs[id]);
  if (missing.length) {
    throw new Error(`club register: ${missing.length} unknown clubId(s): ${missing.join(", ")}`);
  }
}

/** The clubs of one league-season as {clubId, name} pairs, register-resolved. */
export function seasonClubs(register, clubIds) {
  assertClubsKnown(register, clubIds);
  return [...new Set(clubIds)]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((clubId) => ({ clubId, name: resolveClubName(register, clubId) }));
}
