// ============================================================================
//  clubelo — point-in-time club ratings.
//
//  Two endpoints, both CSV, no API key:
//    api.clubelo.com/<YYYY-MM-DD>  every club's rating on that day
//    api.clubelo.com/<ClubName>    one club's full history
//
//  A WRONG NAME DOES NOT 404 — verified 2026-07-23. clubelo answers HTTP 200
//  with the bare header and no rows, so a typo would pass silently as "no
//  ratings". Every parse here goes through `hasRealHistory`/row checks instead
//  of trusting the status code. See docs/verification/clubelo.md.
//
//  The two name forms are NOT interchangeable: the per-club URL strips spaces
//  ("UnionBerlin"), the daily CSV's `Club` column keeps them ("Union Berlin").
//  clubMapping.mjs carries both explicitly; nothing here derives one from the
//  other.
// ============================================================================

const BASE = "http://api.clubelo.com";
export const USER_AGENT = "bundesliga-app/0.1 (+https://github.com/manganite/bundesliga)";

export class RatingSourceError extends Error {}

export async function defaultFetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const EXPECTED_HEADER = "Rank,Club,Country,Level,Elo,From,To";

/** Parse a clubelo CSV body into rows, rejecting a header-only response. */
export function parseCsv(text, { what = "clubelo response" } = {}) {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new RatingSourceError(`${what}: empty body`);
  if (lines[0] !== EXPECTED_HEADER) {
    throw new RatingSourceError(`${what}: unexpected header ${JSON.stringify(lines[0])}`);
  }
  return lines.slice(1).map((line) => {
    const [rank, club, country, level, elo, from, to] = line.split(",");
    const value = Number(elo);
    if (!Number.isFinite(value)) throw new RatingSourceError(`${what}: non-numeric Elo in ${JSON.stringify(line)}`);
    return { rank, club, country, level, elo: value, from, to };
  });
}

/**
 * All clubs' ratings on one day.
 *
 * `date` is the `effectiveAt` of the resulting snapshot: the day the rating
 * refers to, as distinct from `observedAt`, the moment we fetched it (§5.3).
 */
/**
 * A response can be structurally valid — right header, ~600 rows — and still
 * describe a DIFFERENT DAY. clubelo serves cached pages when it is overloaded,
 * and none of the other guards would notice.
 *
 * So: a substantial majority of rows must actually cover the requested date.
 * Deliberately a majority rather than all-or-nothing, because individual clubs
 * legitimately fall outside the range — a club whose series clubelo has stopped
 * extending is exactly the case Part 2.6 exists for. A strict "every row must
 * cover it" rule would fail permanently on that. The majority test separates
 * "a few clubs are stuck" from "this CSV is from another day".
 */
export const DATE_COVERAGE_MIN_SHARE = 0.9;

export function dateCoverage(rows, date) {
  const covering = rows.filter((r) => r.from <= date && date <= r.to);
  const from = rows.map((r) => r.from).sort();
  const to = rows.map((r) => r.to).sort();
  return {
    share: rows.length ? covering.length / rows.length : 0,
    covering: covering.length,
    total: rows.length,
    // What the response actually describes, for a message worth reading.
    describes: rows.length ? { earliestFrom: from[0], latestTo: to[to.length - 1] } : null,
  };
}

export async function fetchDailySnapshot(date, fetchText = defaultFetchText) {
  const rows = parseCsv(await fetchText(`${BASE}/${date}`), { what: `clubelo snapshot ${date}` });
  if (rows.length < 100) {
    // The real snapshot carries ~600 clubs. Anything this thin is a broken
    // response, not a quiet day.
    throw new RatingSourceError(`clubelo snapshot ${date}: only ${rows.length} rows — refusing to trust it`);
  }

  const coverage = dateCoverage(rows, date);
  if (coverage.share < DATE_COVERAGE_MIN_SHARE) {
    throw new RatingSourceError(
      `clubelo snapshot ${date}: only ${coverage.covering} of ${coverage.total} rows `
        + `(${(coverage.share * 100).toFixed(1)} %) cover that date. The response describes `
        + `${coverage.describes.earliestFrom} … ${coverage.describes.latestTo} — a stale cache is a `
        + "source failure, not data.",
    );
  }

  return { effectiveAt: date, rows, coverage };
}

/** Minimum rows before a club history is believable — a typo yields zero. */
export const MIN_HISTORY_ROWS = 50;

/**
 * One club's full published history, used for the mid-season backfill (§5.3).
 * Rows carry `From`/`To`, so a rating valid before a given kickoff can be
 * selected exactly.
 */
export async function fetchClubHistory(clubeloUrlName, fetchText = defaultFetchText) {
  const rows = parseCsv(await fetchText(`${BASE}/${clubeloUrlName}`), {
    what: `clubelo history ${clubeloUrlName}`,
  });
  if (rows.length < MIN_HISTORY_ROWS) {
    throw new RatingSourceError(
      `clubelo history "${clubeloUrlName}": only ${rows.length} rows. ` +
        "clubelo answers HTTP 200 with an empty body for an unknown name, so this is a mapping error, not a short career.",
    );
  }
  return rows;
}

/**
 * The rating that was in force on `date`, from a club history.
 * clubelo's rows are half-open ranges [From, To]; both bounds are inclusive in
 * their published data.
 */
export function ratingOn(historyRows, date) {
  for (const r of historyRows) {
    if (r.from <= date && date <= r.to) return r;
  }
  return null;
}

/** Index a daily snapshot by clubelo's CSV club name. */
export function indexSnapshot(snapshot) {
  const byClub = new Map();
  for (const r of snapshot.rows) byClub.set(r.club, r);
  return byClub;
}
