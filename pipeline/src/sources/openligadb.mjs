// ============================================================================
//  OpenLigaDB — results and fixtures. The only source for both (§5.1).
//
//  Licence: Open Database License (ODbL) 1.0, no API key. Every file this
//  pipeline writes records that, and the committed data is itself ODbL — see
//  docs/verification/openligadb.md.
//
//  The season is DETECTED, never hardcoded (§5.5). `getmatchdata/<league>`
//  without a season returns the current matchday of the current season and
//  carries `leagueSeason` on every match, so the documented date-rule fallback
//  the brief allows is not needed.
// ============================================================================

const BASE = "https://api.openligadb.de";
export const USER_AGENT = "bundesliga-app/0.1 (+https://github.com/manganite/bundesliga)";
export const SOURCE_LICENCE = "ODbL 1.0";

/** Injectable so tests run offline against committed fixtures. */
export async function defaultFetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export class SourceError extends Error {}

/**
 * Detect the current season and matchday.
 *
 * Returns `season` (OpenLigaDB's convention: 2026 means 2026/27) and the
 * current matchday. Off-season, OpenLigaDB already publishes the coming
 * season's fixtures, so this returns matchday 1 with nothing played — which is
 * exactly the pre-season state §5.5 requires the app to handle.
 */
export async function detectCurrentSeason(league = "bl1", fetchJson = defaultFetchJson) {
  const current = await fetchJson(`${BASE}/getmatchdata/${league}`);
  if (!Array.isArray(current) || current.length === 0) {
    throw new SourceError(`getmatchdata/${league} returned nothing — cannot detect the season`);
  }
  const first = current[0];
  const season = Number(first.leagueSeason);
  if (!Number.isInteger(season) || season < 1963 || season > 2100) {
    throw new SourceError(`implausible leagueSeason ${JSON.stringify(first.leagueSeason)}`);
  }
  return {
    season,
    matchday: first.group?.groupOrderID ?? null,
    leagueName: first.leagueName,
    detectedFrom: `${BASE}/getmatchdata/${league}`,
  };
}

/** The final result of a match, or null when it has not been played. */
function finalResult(match) {
  if (!match.matchIsFinished) return null;
  const results = match.matchResults ?? [];
  const final = results.find((r) => r.resultTypeID === 2)
    ?? results.find((r) => r.resultName === "Endergebnis");
  if (!final) {
    throw new SourceError(`match ${match.matchID} is finished but carries no Endergebnis`);
  }
  const gh = final.pointsTeam1;
  const ga = final.pointsTeam2;
  if (!Number.isInteger(gh) || !Number.isInteger(ga) || gh < 0 || ga < 0) {
    throw new SourceError(`match ${match.matchID} has a non-integer result ${gh}:${ga}`);
  }
  return [gh, ga];
}

/**
 * Fetch one full season and normalise it into the shape the engine consumes.
 *
 * Fixture ids are OpenLigaDB's `matchID` as a string. They are stable, so the
 * random keys derived from them (§3) stay stable across pipeline runs, and the
 * per-fixture pre-match dataset (§5.3) can key off them.
 */
export async function fetchSeason(league, season, fetchJson = defaultFetchJson) {
  const raw = await fetchJson(`${BASE}/getmatchdata/${league}/${season}`);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new SourceError(`no matches for ${league} ${season}`);
  }
  return normaliseSeason(league, season, raw);
}

export function normaliseSeason(league, season, raw) {
  const fixtures = raw.map((m) => {
    const result = finalResult(m);
    const fx = {
      id: String(m.matchID),
      matchday: m.group?.groupOrderID ?? null,
      kickoff: m.matchDateTimeUTC ?? m.matchDateTime,
      home: m.team1,
      away: m.team2,
      finished: Boolean(m.matchIsFinished),
    };
    if (result) {
      fx.gh = result[0];
      fx.ga = result[1];
    }
    return fx;
  });

  fixtures.sort((a, b) => (a.matchday - b.matchday) || String(a.kickoff).localeCompare(String(b.kickoff)) || a.id.localeCompare(b.id));

  return {
    league,
    season,
    source: {
      results: `OpenLigaDB ${BASE}/getmatchdata/${league}/${season}`,
      licence: SOURCE_LICENCE,
    },
    fixtures,
  };
}
