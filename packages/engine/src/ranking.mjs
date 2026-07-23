// ============================================================================
//  League table + DFL ranking.
//
//  Source of truth: DFL Spielordnung (SpOL), Stand 06.03.2026, § 5 Nr. 3 c),
//  verified against the primary PDF — see docs/verification/dfl-spielordnung.md.
//
//  This deliberately does NOT reproduce brief §6's order, which was sourced
//  from a third party and got two things wrong: it invented a "points in the
//  head-to-head" step that the Spielordnung does not contain, and it omitted
//  the in-season rules entirely. §11 mandated this verification precisely so
//  the primary source would govern.
//
//  Ranking order once clubs are level on points:
//    1) Tordifferenz (subtraction method)
//    2) Anzahl der erzielten Tore
//    3) Gesamtergebnis aus Hin- und Rückspiel im direkten Vergleich
//    4) Anzahl der auswärts erzielten Tore im direkten Vergleich
//    5) Anzahl aller auswärts erzielten Tore
//    6) Entscheidungsspiel auf neutralem Platz
//
//  In-season (§ 5 Nr. 3 c, continued):
//    - before a tied group's mutual home AND away matches have been played,
//      ONLY criteria 1) and 2) apply; anything still tied shares a table
//      position ("geteilter Tabellenplatz")
//    - once they have been played, criteria 3)–5) apply during the season too
//    - criterion 6) never applies during a running season
//
//  Everything here is season-dependent configuration, never a constant (§6):
//  points for a win and the criterion order both come from the season rules, so
//  the V2 historical window can carry its own (1995/96 is the first
//  three-point season — docs/verification/drei-punkte-regel.md).
// ============================================================================

/** Default rules for a current Bundesliga / 2. Bundesliga season. */
export const CURRENT_SEASON_RULES = {
  pointsForWin: 3,
  pointsForDraw: 1,
  // The criterion chain, in SpOL order. Named so a historical season can
  // override it once Gate 5 (docs/verification/dfl-spielordnung.md) is closed.
  criteria: ["goalDifference", "goalsFor", "h2hAggregate", "h2hAwayGoals", "awayGoals"],
};

const emptyRow = (clubId) => ({
  clubId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  gd: 0,
  awayGoals: 0,
  pts: 0,
});

/**
 * Build the table from played matches.
 *
 * `matches` are only the PLAYED ones: [{ home, away, gh, ga }]. Clubs with no
 * matches still appear, so an off-season or pre-season table is complete.
 *
 * Note (§7): clubs do NOT all have the same number of matches during a matchday
 * or after a postponement. Nothing here assumes they do, and every per-club
 * average elsewhere normalises by `played`.
 */
export function buildTable(clubIds, matches, rules = CURRENT_SEASON_RULES) {
  const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]));
  for (const { home, away, gh, ga } of matches) {
    const H = rows.get(home);
    const A = rows.get(away);
    if (!H || !A) throw new Error(`match references unknown club: ${home} vs ${away}`);
    H.played++; A.played++;
    H.gf += gh; H.ga += ga;
    A.gf += ga; A.ga += gh;
    A.awayGoals += ga;
    if (gh > ga) { H.pts += rules.pointsForWin; H.won++; A.lost++; }
    else if (gh < ga) { A.pts += rules.pointsForWin; A.won++; H.lost++; }
    else { H.pts += rules.pointsForDraw; A.pts += rules.pointsForDraw; H.drawn++; A.drawn++; }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return [...rows.values()];
}

/**
 * Head-to-head mini-table over exactly `group`, from only the matches among
 * them. Recomputed fresh on each narrowing — a smaller tied subset can rank
 * differently than its parent.
 *
 * The SpOL wording ("Gesamtergebnis aus Hin- und Rückspiel") is written for the
 * two-club case. Applying it to three or more via a mini-table is a documented
 * interpretation, not a statement of the Spielordnung — see
 * docs/verification/dfl-spielordnung.md §4.4.
 */
function h2hTable(group, matches) {
  const ids = new Set(group.map((r) => r.clubId));
  const t = new Map(group.map((r) => [r.clubId, { gf: 0, ga: 0, gd: 0, awayGoals: 0, met: 0 }]));
  for (const { home, away, gh, ga } of matches) {
    if (!ids.has(home) || !ids.has(away)) continue;
    const H = t.get(home);
    const A = t.get(away);
    H.gf += gh; H.ga += ga;
    A.gf += ga; A.ga += gh;
    A.awayGoals += ga;
    H.met++; A.met++;
  }
  for (const r of t.values()) r.gd = r.gf - r.ga;
  return t;
}

/**
 * Has every pair inside `group` played BOTH legs? That is the condition the
 * SpOL attaches criteria 3)–5) to during a running season.
 */
function bothLegsPlayed(group, matches) {
  const ids = new Set(group.map((r) => r.clubId));
  const seen = new Set();
  for (const { home, away } of matches) {
    if (ids.has(home) && ids.has(away)) seen.add(`${home}>${away}`);
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a !== b && !seen.has(`${a}>${b}`)) return false;
    }
  }
  return true;
}

/** Split an already-sorted list into runs of entries that compare equal. */
function runsOf(sorted, equal) {
  const runs = [];
  for (const r of sorted) {
    const last = runs[runs.length - 1];
    if (last && equal(last[0], r)) last.push(r);
    else runs.push([r]);
  }
  return runs;
}

/**
 * Rank clubs level on points, goal difference and goals scored — i.e. resolve
 * criteria 3) onwards. Returns a list of *blocks*: each block is a set of clubs
 * that could not be separated any further and therefore shares a position.
 */
function resolveDirectComparison(group, matches, ctx) {
  // In a running season the direct comparison is only available once the tied
  // clubs have met home and away. Before that the SpOL stops after criterion 2.
  if (ctx.inSeason && !bothLegsPlayed(group, matches)) return [group];

  const mini = h2hTable(group, matches);
  const sorted = group.slice().sort((x, y) => {
    const mx = mini.get(x.clubId);
    const my = mini.get(y.clubId);
    return my.gd - mx.gd || my.awayGoals - mx.awayGoals;
  });
  const sameH2h = (x, y) => {
    const mx = mini.get(x.clubId);
    const my = mini.get(y.clubId);
    return mx.gd === my.gd && mx.awayGoals === my.awayGoals;
  };
  const runs = runsOf(sorted, sameH2h);

  // No separation at all — the mini-table cannot shrink further, so fall
  // through to criterion 5) and then 6).
  if (runs.length === 1) return resolveAwayGoalsAndDecider(group, ctx);

  return runs.flatMap((run) =>
    run.length === 1 ? [run] : resolveDirectComparison(run, matches, ctx),
  );
}

/** Criteria 5) all away goals, then 6) Entscheidungsspiel. */
function resolveAwayGoalsAndDecider(group, ctx) {
  const sorted = group.slice().sort((x, y) => y.awayGoals - x.awayGoals);
  const runs = runsOf(sorted, (x, y) => x.awayGoals === y.awayGoals);

  return runs.flatMap((run) => {
    if (run.length === 1) return [run];
    // Criterion 6) does not apply during a running season — the clubs share the
    // position instead.
    if (ctx.inSeason || !ctx.decider) return [run];
    // A play-off at a neutral venue cannot be played inside a simulation. The
    // decider stands in for it exactly where the rules end in a genuine tie; it
    // is never silently treated as a real criterion. Callers pass a
    // counter-based key so the stand-in stays reproducible (§3).
    const keyed = run.map((r) => ({ r, k: ctx.decider(r.clubId) }));
    keyed.sort((x, y) => x.k - y.k);
    return keyed.map((x) => [x.r]);
  });
}

/**
 * Rank a table.
 *
 * @param {Array} rows      from buildTable
 * @param {Array} matches   the played matches (same list buildTable saw)
 * @param {object} opts
 * @param {boolean} opts.inSeason  true while the season is running. Controls the
 *                                 two SpOL in-season rules: criteria 3)–5) need
 *                                 both legs, and criterion 6) is unavailable.
 * @param {(clubId:string)=>number} [opts.decider]  stand-in for criterion 6)
 * @param {object} [opts.rules]
 *
 * @returns {Array} rows in table order, each with `rank` and `sharedRank`.
 *   Clubs that could not be separated all carry the SAME `rank` and
 *   `sharedRank: true` — this is the Spielordnung's "geteilter Tabellenplatz",
 *   a real state of a Bundesliga table in the first half of a season, and the
 *   UI must render it as such rather than inventing an order.
 */
export function rankTable(rows, matches, { inSeason = true, decider = null, rules = CURRENT_SEASON_RULES } = {}) {
  const ctx = { inSeason, decider, rules };

  // Entry criterion: points. Then 1) goal difference, 2) goals scored.
  const sorted = rows.slice().sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  const tiers = runsOf(sorted, (x, y) => x.pts === y.pts && x.gd === y.gd && x.gf === y.gf);

  const blocks = tiers.flatMap((tier) =>
    tier.length === 1 ? [tier] : resolveDirectComparison(tier, matches, ctx),
  );

  const out = [];
  let rank = 1;
  for (const block of blocks) {
    for (const row of block) {
      out.push({ ...row, rank, sharedRank: block.length > 1 });
    }
    rank += block.length; // standard competition ranking: 1,2,2,4
  }
  return out;
}

/**
 * Positions a club can occupy, given a ranked table. With shared ranks a club
 * does not have a single position, so anything that needs one (zone tallies,
 * clinch logic) must ask for the range rather than assume `rank`.
 */
export function positionRange(ranked, clubId) {
  const row = ranked.find((r) => r.clubId === clubId);
  if (!row) throw new Error(`unknown club: ${clubId}`);
  const shared = ranked.filter((r) => r.rank === row.rank).length;
  return { from: row.rank, to: row.rank + shared - 1 };
}
