// ============================================================================
//  Loading committed data. This is the app's ONLY data path (§5.1).
//
//  There is no browser-side live fetch of results or ratings: that would
//  contradict the committed-data contract and can produce inconsistent states.
//  Everything here reads files this repository committed, served from the same
//  origin.
// ============================================================================

// Guarded so this module can also be imported by the Node tests, which have no
// vite environment. In the browser `import.meta.env` is always present and
// BASE_URL is what the deployment was built with.
const ENV = import.meta.env ?? {};
const BASE = `${ENV.BASE_URL ?? "/"}data/`;

async function getJson(rel) {
  const res = await fetch(`${BASE}${rel}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Load a file that MAY legitimately be absent, and only then (§Codex §4).
 *
 * ONLY HTTP 404 becomes `null` — a missing artefact or an empty pre-season file
 * is a real state the UI handles. Everything else — a network failure, a 5xx, a
 * truncated or malformed JSON body — THROWS, so it reaches the visible
 * fail-loud error state instead of masquerading as „gibt es noch nicht". Fail
 * loud is the project line; the swallow-everything helper was the exception.
 */
export async function getOptionalJson(rel) {
  let res;
  try {
    res = await fetch(`${BASE}${rel}`, { cache: "no-cache" });
  } catch (e) {
    throw new Error(`${rel}: Netzwerkfehler (${e.message})`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${rel}: ungültiges JSON (${e.message})`);
  }
}

/**
 * What the build actually shipped. The app never probes for files that may not
 * exist, and never assumes a season — both are discovered (§5.5).
 */
export async function loadManifest() {
  return getJson("index.json");
}

/**
 * Everything one league-season needs, in one go.
 *
 * `playoff.json` is SEASON-level, not per league: the relegation play-off is one
 * simulation across both leagues and both views read it from complementary
 * sides. Loading it here means the toggle never changes which pairing numbers
 * are in play — only which side of them is shown.
 */
export async function loadLeagueSeason(season, league) {
  const [meta, config, seasonData, outlook, timeline, timelineLive, prematch, params, playoff, relegation] = await Promise.all([
    getOptionalJson("meta.json"),
    getJson(`seasons/${season}/config.json`),
    getJson(`seasons/${season}/${league}/season.json`),
    getOptionalJson(`seasons/${season}/${league}/outlook.json`),
    getOptionalJson(`seasons/${season}/${league}/timeline-frozen.json`),
    getOptionalJson(`seasons/${season}/${league}/timeline-live.json`),
    getOptionalJson(`seasons/${season}/${league}/prematch.json`),
    getOptionalJson("season-params.json"),
    getOptionalJson(`seasons/${season}/playoff.json`),
    // Season-level, one file for all seasons (§V2b.1 G1). Optional.
    getOptionalJson("relegation.json"),
  ]);
  return { meta, config, season: seasonData, outlook, timeline, timelineLive, prematch, params, playoff, relegation };
}

/** Clubs keyed by id, with their display name. */
export function clubIndex(seasonData) {
  return new Map(seasonData.clubs.map((c) => [c.clubId, c]));
}

export const playedFixtures = (fixtures) => fixtures.filter((f) => f.gh !== undefined && f.ga !== undefined);
export const remainingFixtures = (fixtures) => fixtures.filter((f) => f.gh === undefined || f.ga === undefined);

/**
 * The matchday the app should show by default: the last one with a result, or
 * 1 before the season starts.
 */
export function currentMatchday(fixtures) {
  const played = playedFixtures(fixtures);
  if (!played.length) return 1;
  return Math.max(...played.map((f) => f.matchday));
}

/** Fixtures as the engine wants them. */
export const toEngineFixtures = (fixtures) => fixtures.map((f) => ({
  id: f.id,
  home: f.homeClubId,
  away: f.awayClubId,
  ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}),
}));
