// ============================================================================
//  Club identity — fail closed (brief §5.2).
//
//  Clubs come from OpenLigaDB fixtures; ratings come from clubelo. The join is a
//  CURATED ONE-TO-ONE mapping. Never a short name, never a substring: pooling
//  both divisions over many seasons puts BOTH clubs of many pairs in the data —
//  Frankfurt (Eintracht/FSV), Köln (1. FC/Fortuna), München (Bayern/1860),
//  Stuttgart (VfB/Kickers), Leipzig (RB/VfB), Borussia (Dortmund/Gladbach),
//  Kickers (Offenbach/Stuttgart/Würzburg), Fortuna (Düsseldorf/Köln).
//
//  A wrong match is worse than a missing one because it is silent. So an
//  unresolved club fails the job and blocks the commit, and a test asserts both
//  that every fixture club resolves and that no two clubs share a rating key.
//
//  TWO NAME FORMS, verified 2026-07-23 (docs/verification/clubelo.md): clubelo's
//  per-club URL strips spaces ("UnionBerlin") while the daily CSV's `Club`
//  column keeps them ("Union Berlin"). Both are carried explicitly here. Nothing
//  is derived from the other, because a derivation that is right for 33 clubs
//  and wrong for 3 is exactly the silent failure this module exists to prevent.
//
//  clubelo DOES NOT 404 ON A WRONG NAME — verified 2026-07-23. A misspelled club
//  returns HTTP 200 with the CSV header and no rows. Any caller must therefore
//  treat a header-only response as a failure; `hasRealHistory` below is that
//  check, and every name in the table was verified against it.
// ============================================================================

/**
 * Minimum data rows before a clubelo history is believable. A wrong name yields
 * zero rows behind an HTTP 200, and even a genuinely obscure club carries
 * hundreds of rows, so anything this thin is a mapping error, not a short
 * career.
 */
export const MIN_HISTORY_ROWS = 50;

/** True when a clubelo CSV body is a real history rather than a bare header. */
export function hasRealHistory(csvText) {
  return csvText.trim().split("\n").filter(Boolean).length >= MIN_HISTORY_ROWS + 1;
}

/**
 * OpenLigaDB `shortName` -> clubelo identity.
 *
 *   url : the per-club history endpoint name, api.clubelo.com/<url>
 *   csv : the `Club` column in the daily all-clubs snapshot
 *
 * Where the two are the same only one field is given and `csv` defaults to
 * `url`. Entries exist for every club that has appeared in either division in
 * the seasons this repo covers; unknown clubs fail loudly rather than being
 * transliterated on a guess.
 */
const MAP = {
  // --- Bundesliga / 2. Bundesliga 2026/27 -----------------------------------
  "Bayern": { url: "Bayern" },
  "Dortmund": { url: "Dortmund" },
  "Leverkusen": { url: "Leverkusen" },
  "Leipzig": { url: "RBLeipzig", csv: "RB Leipzig" },
  "Freiburg": { url: "Freiburg" },
  "Hoffenheim": { url: "Hoffenheim" },
  "Mainz": { url: "Mainz" },
  "Frankfurt": { url: "Frankfurt" },
  "Gladbach": { url: "Gladbach" },
  "Augsburg": { url: "Augsburg" },
  "Union Berlin": { url: "UnionBerlin", csv: "Union Berlin" },
  "Bremen": { url: "Werder", csv: "Werder" },
  "HSV": { url: "Hamburg", csv: "Hamburg" },
  "Köln": { url: "Koeln", csv: "Koeln" },
  "Heidenheim": { url: "Heidenheim" },
  "St. Pauli": { url: "StPauli", csv: "St Pauli" },
  "Hannover": { url: "Hannover" },
  "Paderborn": { url: "Paderborn" },
  "Elversberg": { url: "Elversberg" },
  "Schalke": { url: "Schalke" },
  "Bochum": { url: "Bochum" },
  "Darmstadt": { url: "Darmstadt" },
  "Kiel": { url: "Holstein", csv: "Holstein" },
  "Hertha": { url: "Hertha" },
  "Nürnberg": { url: "Nuernberg", csv: "Nuernberg" },
  "Magdeburg": { url: "Magdeburg" },
  "Karlsruhe": { url: "Karlsruhe" },
  "Dresden": { url: "Dresden" },
  "Bielefeld": { url: "Bielefeld" },
  "Fürth": { url: "Fuerth", csv: "Fuerth" },
  "Braunschweig": { url: "Braunschweig" },
  "Cottbus": { url: "Cottbus" },
  "Osnabrück": { url: "Osnabrueck", csv: "Osnabrueck" },
  "Stuttgart": { url: "Stuttgart" },
  "Wolfsburg": { url: "Wolfsburg" },
  "Kaiserslautern": { url: "Lautern", csv: "Lautern" },
  // --- further clubs seen in recent seasons ---------------------------------
  "Duisburg": { url: "Duisburg" },
  "Düsseldorf": { url: "Duesseldorf", csv: "Duesseldorf" },
  "Regensburg": { url: "Regensburg" },
  "Münster": { url: "Muenster", csv: "Muenster" },
  "Ulm": { url: "Ulm" },
  "Sandhausen": { url: "Sandhausen" },
  "Rostock": { url: "Rostock" },
  "Ingolstadt": { url: "Ingolstadt" },
  "Aue": { url: "Aue" },
  "Wehen": { url: "Wehen" },
  "Würzburg": { url: "Wuerzburg", csv: "Wuerzburg" },
  "1860 München": { url: "Muenchen60", csv: "Muenchen60" },
  "Fortuna Köln": { url: "FortunaKoeln", csv: "Fortuna Koeln" },
  "FSV Frankfurt": { url: "FSVFrankfurt", csv: "FSV Frankfurt" },
};

/** OpenLigaDB entries whose `shortName` is blank, keyed by teamId. */
const TEAM_ID_FIX = { 1067: "Aue" };

/**
 * Distinct OpenLigaDB short names that denote the SAME club. Folding them here
 * — rather than giving each its own MAP entry pointing at one clubelo history —
 * keeps the club identity single, so the one-to-one check below stays a real
 * check instead of tripping over the club's own aliases.
 */
const ALIAS = {
  "TSG 1899 Hoffenheim": "Hoffenheim",
  "TSG Hoffenheim": "Hoffenheim",
  "Werder Bremen": "Bremen",
  "Wiesbaden": "Wehen",
  "SSV Ulm 1846": "Ulm",
};

export class ClubResolutionError extends Error {}

/** The canonical short name for an OpenLigaDB team object. */
export function canonicalShortName(team) {
  const raw = (team.shortName && team.shortName.trim()) || TEAM_ID_FIX[team.teamId];
  if (!raw) {
    throw new ClubResolutionError(
      `OpenLigaDB team ${team.teamId} ("${team.teamName}") has no shortName and no override`,
    );
  }
  return ALIAS[raw] ?? raw;
}

/**
 * Resolve one OpenLigaDB team to its clubelo identity.
 * Throws rather than guessing — §5.2 fail closed.
 */
export function resolveClub(team) {
  const short = canonicalShortName(team);
  const entry = MAP[short];
  if (!entry) {
    throw new ClubResolutionError(
      `no clubelo mapping for "${short}" (OpenLigaDB team ${team.teamId}, "${team.teamName}"). ` +
        "Add it to pipeline/src/clubMapping.mjs — never join on a short name or substring.",
    );
  }
  return {
    clubId: short,
    openLigaDbId: String(team.teamId),
    name: team.teamName,
    clubeloUrlName: entry.url,
    clubeloCsvName: entry.csv ?? entry.url,
  };
}

/**
 * Resolve every club of a fixture list, asserting the one-to-one property.
 * Returns a Map clubId -> resolved club.
 *
 * The one-to-one property is between CLUB IDENTITY and rating key, not between
 * OpenLigaDB teamId and rating key. OpenLigaDB really does carry two ids for one
 * club (Würzburger Kickers has 398 and 4437), and folding those together is
 * correct; what must never happen is two *different* clubs sharing one clubelo
 * history.
 */
export function resolveAll(matches) {
  const teams = new Map();
  for (const m of matches) {
    for (const t of [m.team1, m.team2]) teams.set(t.teamId, t);
  }
  const byClubId = new Map();
  const byRatingKey = new Map();
  for (const team of teams.values()) {
    const club = resolveClub(team);
    const clash = byRatingKey.get(club.clubeloUrlName);
    if (clash && clash.clubId !== club.clubId) {
      throw new ClubResolutionError(
        `"${clash.name}" and "${club.name}" both map to clubelo "${club.clubeloUrlName}" ` +
          `but are different clubs (${clash.clubId} vs ${club.clubId})`,
      );
    }
    const existing = byClubId.get(club.clubId);
    if (existing) {
      // Same club under a second OpenLigaDB id — keep both so fixtures keyed by
      // either id still resolve.
      if (!existing.openLigaDbIds.includes(club.openLigaDbId)) {
        existing.openLigaDbIds.push(club.openLigaDbId);
      }
      continue;
    }
    const record = { ...club, openLigaDbIds: [club.openLigaDbId] };
    byRatingKey.set(club.clubeloUrlName, record);
    byClubId.set(club.clubId, record);
  }
  return byClubId;
}

export const knownShortNames = () => Object.keys(MAP);
