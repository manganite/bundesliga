// ============================================================================
//  The relegation play-off artefact (§6).
//
//  ONE pairing simulation, consumed from both sides. The BL1 view reads
//  `pBl1Wins`, the BL2 view reads its complement — there is no second
//  computation that could disagree with the first.
//
//  Two things are NOT computed here, and both say so in the artefact rather
//  than being silently absent:
//
//   * The BL2 relegation play-off (BL2 16th vs. 3. Liga 3rd). The app carries no
//     3. Liga data, so the opponent distribution does not exist. `Relegations-
//     platz (16.)` therefore stays a placement probability, never a survival one.
//   * The home order, whenever the play-off dates are not yet published. Then
//     every pairing is a 50/50 mixture of both orders and is marked as one.
// ============================================================================

import { pairingProbability, secondLegHost, survivalProbability, promotionProbability, complementOf }
  from "../../packages/engine/src/playoff.mjs";
import { ENGINE_VERSION } from "../../packages/engine/src/simulate.mjs";
import { SIMULATION_PROTOCOL_VERSION } from "../../packages/engine/src/rng.mjs";

/** The pairing simulation's own run count — its own simulation, its own runs. */
export const PAIRING_RUNS = 20000;

/** `"bl1:16"` -> `{ league: "bl1", place: 16 }` */
function parseSide(spec) {
  const m = /^(bl1|bl2):(\d+)$/.exec(String(spec ?? ""));
  if (!m) throw new Error(`relegationPlayoff.between entry "${spec}" is not "<league>:<place>"`);
  return { league: m[1], place: Number(m[2]) };
}

/** P(exactly this place) and P(anywhere in [from, to]) from a position distribution. */
const at = (dist, place) => dist[place - 1] ?? 0;
const within = (dist, from, to) => dist.slice(from - 1, to).reduce((s, x) => s + x, 0);

/**
 * Each club's last league match date, from the fixture list itself.
 *
 * This is „gemäß dem Spielplan der abgelaufenen Spielzeit" read off the schedule
 * the app already has, rather than a second copy of it in the configuration that
 * could drift. The configuration may still override it — where the published
 * schedule and the fetched one disagree, the configuration wins and says so.
 */
export function lastLeagueMatchDates(fixtures, override = null) {
  const out = {};
  for (const f of fixtures) {
    const day = String(f.kickoff).slice(0, 10);
    for (const club of [f.homeClubId, f.awayClubId]) {
      if (!out[club] || day > out[club]) out[club] = day;
    }
  }
  return { ...out, ...(override ?? {}) };
}

/**
 * Build the artefact.
 *
 * @param {object} input
 * @param {number} input.season
 * @param {object} input.playoffConfig  config.relegationPlayoff
 * @param {object} input.outlooks       { bl1, bl2 } current-outlook artefacts
 * @param {object} input.fixtures       { bl1, bl2 } fixture lists
 * @param {object} input.ratings        clubId -> current rating
 * @param {object} input.params         raw season params
 */
export function buildPlayoffArtefact({
  season, playoffConfig, outlooks, fixtures, ratings, params,
  runs = PAIRING_RUNS, log = () => {},
}) {
  const base = {
    kind: "relegationPlayoff",
    schemaVersion: 1,
    season,
    engineVersion: ENGINE_VERSION,
    simulationProtocolVersion: SIMULATION_PROTOCOL_VERSION,
  };

  if (!playoffConfig?.exists) {
    // 1992/93–2007/08: the bottom three went down directly and 16th was not a
    // play-off place. Recorded, not omitted — an absent artefact is ambiguous.
    return { ...base, exists: false, reason: "Diese Saison kennt keine Relegation (§5.4).", pairings: [] };
  }

  const [sideA, sideB] = (playoffConfig.between ?? []).map(parseSide);
  if (sideA?.league !== "bl1" || sideB?.league !== "bl2") {
    throw new Error(`relegationPlayoff.between must be a bl1/bl2 pair, got ${JSON.stringify(playoffConfig.between)}`);
  }

  // ---- the home order, derived per pairing ---------------------------------
  const firstLegDate = playoffConfig.playoffDates?.firstLeg ?? null;
  const lastMatch = {
    ...lastLeagueMatchDates(fixtures.bl1, playoffConfig.lastLeagueMatchdayDates),
    ...lastLeagueMatchDates(fixtures.bl2, playoffConfig.lastLeagueMatchdayDates),
  };
  const lot = playoffConfig.lotDrawn ?? null; // { bl1Club, bl2Club, hostsSecondLeg: "bl1"|"bl2" }

  // ---- the pairings --------------------------------------------------------
  const bl1Clubs = outlooks.bl1.clubs;
  const bl2Clubs = outlooks.bl2.clubs;
  const pSixteenth = Object.fromEntries(
    bl1Clubs.map((c) => [c, at(outlooks.bl1.positionDistribution[c], sideA.place)]),
  );
  const pThird = Object.fromEntries(
    bl2Clubs.map((c) => [c, at(outlooks.bl2.positionDistribution[c], sideB.place)]),
  );

  const pairings = [];
  let mixed = 0;
  for (const bl1Club of bl1Clubs) {
    for (const bl2Club of bl2Clubs) {
      // No pruning: §6 requires the sum over ALL possible opponents, and a
      // threshold would be a silent cap on a probability the caption claims is
      // complete. 324 pairings is affordable; a cut is not honest.
      const lotWinner = lot && lot.bl1Club === bl1Club && lot.bl2Club === bl2Club
        ? (lot.hostsSecondLeg === "bl1" ? "A" : "B")
        : null;
      const hostRule = secondLegHost({
        firstLegDate,
        lastMatchA: lastMatch[bl1Club] ?? null,
        lastMatchB: lastMatch[bl2Club] ?? null,
        lotWinner,
      });
      const sim = pairingProbability({
        seasonId: `${season}`,
        clubA: bl1Club, clubB: bl2Club,
        ratingA: ratings[bl1Club], ratingB: ratings[bl2Club],
        params, playoffConfig, hostRule, runs,
      });
      if (sim.homeOrderMixed) mixed++;
      pairings.push({
        // Both leagues named on every row — no reader should have to infer
        // which side of a pairing is which from the club name alone.
        bl1Club, bl2Club,
        pBl1Wins: sim.pAWins,
        pBl2Wins: complementOf(sim.pAWins),
        hostsSecondLeg: sim.hostSecondLeg === null ? null : (sim.hostSecondLeg === "A" ? "bl1" : "bl2"),
        homeOrderMixed: sim.homeOrderMixed,
        homeOrderBasis: sim.hostBasis,
        restDays: hostRule.restDays ?? null,
      });
    }
  }
  log(`play-off: ${pairings.length} pairings at ${runs} runs, ${mixed} with an undetermined home order`);

  const byPair = new Map(pairings.map((p) => [`${p.bl1Club}|${p.bl2Club}`, p]));

  // ---- the two league views, from the one simulation -----------------------
  const bl1 = Object.fromEntries(bl1Clubs.map((club) => {
    const dist = outlooks.bl1.positionDistribution[club];
    const pSafe = within(dist, 1, sideA.place - 1);
    const opponents = bl2Clubs.map((o) => ({
      club: o, pThird: pThird[o], pWin: byPair.get(`${club}|${o}`).pBl1Wins,
    }));
    return [club, {
      pSafe,
      pRelegationPlayoff: pSixteenth[club],
      pKlassenerhalt: survivalProbability({ pSafe, pRelegationPlayoff: pSixteenth[club], opponents }),
      // The expected win probability against the opponent mixture, for the
      // caption. Σ_j P(j 3rd) = 1, so this is a proper average, not a sum.
      pWinsPlayoff: opponents.reduce((s, o) => s + o.pThird * o.pWin, 0),
    }];
  }));

  const bl2 = Object.fromEntries(bl2Clubs.map((club) => {
    const dist = outlooks.bl2.positionDistribution[club];
    const pDirect = within(dist, 1, sideB.place - 1);
    const opponents = bl1Clubs.map((o) => ({
      club: o, pSixteenth: pSixteenth[o], pWin: byPair.get(`${o}|${club}`).pBl2Wins,
    }));
    return [club, {
      pDirect,
      pPlayoffPlace: pThird[club],
      pAufstieg: promotionProbability({ pDirect, pPlayoffPlace: pThird[club], opponents }),
      pWinsPlayoff: opponents.reduce((s, o) => s + o.pSixteenth * o.pWin, 0),
    }];
  }));

  return {
    ...base,
    exists: true,
    between: playoffConfig.between,
    runs,
    parameterLeague: playoffConfig.parameterLeague ?? "bl1",
    awayGoalsApply: playoffConfig.awayGoalsApply === true,
    homeOrder: {
      rule: playoffConfig.homeOrderRule ?? null,
      firstLegDate,
      lastMatchDatesFrom: playoffConfig.lastLeagueMatchdayDates ? "season configuration" : "the fetched schedule",
      mixedPairings: mixed,
      totalPairings: pairings.length,
    },
    // Named in the artefact so no caption can be written without it.
    approximation: "Marginalnäherung: P(i schlägt j) wird aus den heutigen Ratings berechnet und mit "
      + "P(i auf 16.)·P(j auf 3.) multipliziert. Die Paarungssimulation zieht RATING_SIGMA neu, statt die "
      + "Ziehungen der Ligaläufe zu erben — wie es 16. zu werden über die Stärke aussagt, geht also nicht ein.",
    notComputed: {
      bl2Relegation: "Die Relegation 2. Bundesliga (16.) gegen 3. Liga (3.) wird nicht berechnet: Die App "
        + "führt keine Daten der 3. Liga, also existiert die Gegnerverteilung nicht. Der "
        + "Relegationsplatz (16.) bleibt deshalb eine Platzierungswahrscheinlichkeit und wird "
        + "nirgends als Klassenerhalt gelesen.",
    },
    // Carried in the artefact so a single-league view is self-contained: the
    // Bundesliga page must be able to name its possible opponents and weight
    // them without loading the 2.-Liga outlook, and vice versa.
    placeProbability: { bl1: pSixteenth, bl2: pThird },
    pairings,
    bl1,
    bl2,
  };
}
