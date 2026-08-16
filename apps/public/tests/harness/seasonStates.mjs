// ============================================================================
//  Season states for tests, CONSTRUCTED rather than borrowed from the running
//  season.
//
//  The rule these exist to serve (CLAUDE.md): a test on the LIVE season may
//  assert structural things — every provenance is a known one, every fixture is
//  predictable, the page names its league — but never a property that the
//  calendar takes away. „No match played yet" and „every club still shares
//  rank 1" are true in August and false in September.
//
//  That is not a style point. `test.yml` is the deployment gate, so the day the
//  data moves past such an assumption is the day the site stops updating. It
//  has now happened twice:
//    * 2026-08-09  a `carried-forward > 0` assertion emptied when clubelo
//                  resumed publishing — four deploys died.
//    * 2026-08-15  the 2nd BL2 matchday separated the clubs, the shared-place
//                  caption correctly disappeared — three deploys died.
//  Both tests looked like coverage checks and were weather reports.
//
//  So: take the SHAPE of the committed season — real clubs, real fixture list,
//  real ids — and set the STATE here, where it is ours.
// ============================================================================

/**
 * Every fixture unplayed, whatever the calendar says.
 *
 * Both goals are removed together. A half-defined fixture is its own bug class
 * and would wake the guard that exists for it.
 */
export function preSeason(season) {
  return {
    ...season,
    fixtures: season.fixtures.map(({ gh, ga, ...rest }) => ({ ...rest, finished: false })),
  };
}

/**
 * Matchday 1 played so that NO two clubs are indistinguishable: winner i wins
 * i:0, so goal difference alone separates every club. Everything after
 * matchday 1 is open.
 *
 * This is the state that ended the pre-season's all-share-rank-1 table, and the
 * one whose arrival broke the render tests.
 */
export function separated(season) {
  let n = 0;
  return {
    ...season,
    fixtures: season.fixtures.map((f) => (f.matchday === 1
      ? { ...f, finished: true, gh: ++n, ga: 0 }
      : { ...f, finished: false, gh: undefined, ga: undefined })),
  };
}

/**
 * The first `count` fixtures played, the rest open — for tests that need „some
 * results exist" without caring which.
 */
export function withPlayed(season, count, { gh = 1, ga = 0 } = {}) {
  const open = preSeason(season);
  return {
    ...open,
    fixtures: open.fixtures.map((f, i) => (i < count ? { ...f, finished: true, gh, ga } : f)),
  };
}
