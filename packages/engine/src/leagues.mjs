// ============================================================================
//  League identity — ONE place, so no view can label itself differently.
//
//  V1.1 puts both leagues behind a toggle, and a toggle is exactly where a
//  reader loses track of what they are looking at. Every number on screen means
//  something different depending on the league: "Relegationsplatz" is 16th in the
//  Bundesliga and both 3rd and 16th in the 2. Bundesliga, "Abstieg" means
//  different divisions, and a screenshot carries no toggle state at all.
//
//  So: the label is never written out by hand in a component, and an unknown
//  league is an ERROR rather than an empty string. A view that cannot say which
//  league it is showing must fail loudly instead of showing plausible numbers
//  under no heading.
// ============================================================================

export const LEAGUES = ["bl1", "bl2"];

const LABELS = {
  bl1: { full: "Bundesliga", short: "BL", ordinal: "1. Liga", tier: 1 },
  bl2: { full: "2. Bundesliga", short: "2. BL", ordinal: "2. Liga", tier: 2 },
};

export function isLeague(league) {
  return Object.hasOwn(LABELS, league);
}

function entry(league) {
  // `Object.hasOwn`, not a truthiness check: `LABELS["toString"]` would other-
  // wise return the prototype's method and sail straight past the guard.
  const e = isLeague(league) ? LABELS[league] : undefined;
  if (!e) {
    throw new Error(
      `unknown league "${league}". A view must never render numbers without saying which league `
        + `they belong to — refusing to label it.`,
    );
  }
  return e;
}

/** „Bundesliga" / „2. Bundesliga" — the heading form. */
export const leagueLabel = (league) => entry(league).full;

/** „BL" / „2. BL" — for places where the full name does not fit. Never in a heading. */
export const leagueShort = (league) => entry(league).short;

/** „1. Liga" / „2. Liga" — for sentences about the divisions themselves. */
export const leagueOrdinal = (league) => entry(league).ordinal;

/** 1 or 2. Used to say which direction a relegation play-off goes. */
export const leagueTier = (league) => entry(league).tier;

/** The other league. Throws rather than returning the same one. */
export const otherLeague = (league) => (entry(league).tier === 1 ? "bl2" : "bl1");

/**
 * „Bundesliga 2026/27" — what a page heading and the document title say.
 * Both leagues run the same season numbering, so the label alone is ambiguous
 * without it.
 */
export const leagueSeasonLabel = (league, seasonLabel) => `${leagueLabel(league)} ${seasonLabel}`;
