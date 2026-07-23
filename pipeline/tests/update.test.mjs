import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  runUpdate, attachClubIds, extractRatings, backfillDates, backfillSnapshots, BACKFILL_DELAY_MS,
} from "../src/update.mjs";
import { normaliseSeason } from "../src/sources/openligadb.mjs";

const SEASON = 2026;
const NOW = new Date("2026-09-10T04:00:00.000Z");

const CLUBS = {
  bl1: [
    { teamId: 40, teamName: "FC Bayern München", shortName: "Bayern", elo: 2000.9, csv: "Bayern" },
    { teamId: 7, teamName: "Borussia Dortmund", shortName: "Dortmund", elo: 1834.8, csv: "Dortmund" },
    { teamId: 6, teamName: "Bayer 04 Leverkusen", shortName: "Leverkusen", elo: 1804.0, csv: "Leverkusen" },
    { teamId: 1635, teamName: "RB Leipzig", shortName: "Leipzig", elo: 1761.9, csv: "RB Leipzig" },
  ],
  bl2: [
    { teamId: 9, teamName: "FC Schalke 04", shortName: "Schalke", elo: 1519.7, csv: "Schalke" },
    { teamId: 54, teamName: "Hertha BSC", shortName: "Hertha", elo: 1461.5, csv: "Hertha" },
    { teamId: 18, teamName: "1. FC Nürnberg", shortName: "Nürnberg", elo: 1458.7, csv: "Nuernberg" },
    { teamId: 15, teamName: "Karlsruher SC", shortName: "Karlsruhe", elo: 1435.8, csv: "Karlsruhe" },
  ],
};

const ROUNDS = [
  [[0, 1], [2, 3]], [[0, 2], [3, 1]], [[0, 3], [1, 2]],
  [[1, 0], [3, 2]], [[2, 0], [1, 3]], [[3, 0], [2, 1]],
];
// Matchdays 1–3 are played by 2026-09-10; 4–6 are still ahead.
const MATCHDAY_DATE = ["2026-08-14", "2026-08-21", "2026-08-28", "2026-09-18", "2026-09-25", "2026-10-02"];

function rawMatches(league) {
  const clubs = CLUBS[league];
  const out = [];
  ROUNDS.forEach((round, r) => {
    round.forEach(([h, a], j) => {
      const played = r < 3;
      out.push({
        matchID: Number(`${league === "bl1" ? 1 : 2}${r}${j}`),
        leagueSeason: SEASON,
        leagueName: `Test ${league} ${SEASON}`,
        group: { groupOrderID: r + 1 },
        matchDateTimeUTC: `${MATCHDAY_DATE[r]}T15:30:00Z`,
        team1: clubs[h],
        team2: clubs[a],
        matchIsFinished: played,
        matchResults: played ? [{ resultTypeID: 2, pointsTeam1: 2, pointsTeam2: 0 }] : [],
      });
    });
  });
  return out;
}

/** clubelo's daily CSV needs >= 100 rows to be trusted; pad with filler. */
function dailyCsv(date, bump = 0) {
  const rows = ["Rank,Club,Country,Level,Elo,From,To"];
  for (const league of ["bl1", "bl2"]) {
    for (const c of CLUBS[league]) {
      rows.push(`1,${c.csv},GER,1,${c.elo + bump},${date},${date}`);
    }
  }
  for (let i = 0; i < 120; i++) rows.push(`${i + 50},Filler${i},ENG,1,${1500 + i},${date},${date}`);
  return rows.join("\n");
}

function clubHistoryCsv(club) {
  const rows = ["Rank,Club,Country,Level,Elo,From,To"];
  for (let i = 0; i < 80; i++) {
    const d = new Date(Date.UTC(2026, 4, 1));
    d.setUTCDate(d.getUTCDate() + i * 2);
    const from = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
    const to = d.toISOString().slice(0, 10);
    rows.push(`1,${club.csv},GER,1,${club.elo - 20 + i * 0.25},${from},${to}`);
  }
  return rows.join("\n");
}

function makeSources({ bump = 0, results = null } = {}) {
  const calls = { json: [], text: [] };
  const fetchJson = async (url) => {
    calls.json.push(url);
    if (/getmatchdata\/bl1$/.test(url)) return rawMatches("bl1").slice(0, 2);
    const m = url.match(/getmatchdata\/(bl1|bl2)\/(\d+)/);
    if (m) {
      const raw = rawMatches(m[1]);
      return results ? results(m[1], raw) : raw;
    }
    throw new Error(`unexpected json url ${url}`);
  };
  const fetchText = async (url) => {
    calls.text.push(url);
    const daily = url.match(/clubelo\.com\/(\d{4}-\d{2}-\d{2})$/);
    if (daily) return dailyCsv(daily[1], bump);
    const name = url.split("/").pop();
    const club = [...CLUBS.bl1, ...CLUBS.bl2].find((c) => c.csv.replace(/\s/g, "") === name || c.csv === name);
    if (club) return clubHistoryCsv(club);
    throw new Error(`unexpected text url ${url}`);
  };
  return { fetchJson, fetchText, calls };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.playoff]  give the synthetic season a relegation
 *   play-off. Off by default: the pairing simulation is the expensive part of
 *   the run and only one test needs it, so the rest stay fast.
 */
async function makeDataDir({ playoff = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-pipe-"));
  await fs.mkdir(path.join(dir, "seasons", String(SEASON)), { recursive: true });
  const leagueConfig = {
    clubCount: 4,
    matchdayCount: 6,
    pointsForWin: 3,
    pointsForDraw: 1,
    tiebreakCriteria: ["goalDifference", "goalsFor", "h2hAggregate", "h2hAwayGoals", "awayGoals"],
    // Targets are season configuration (§7); the artefact step needs them.
    targets: {
      meister: { places: 1, from: 1, to: 1, label: "Meister" },
      dritter: { places: 1, from: 3, to: 3, label: "Relegationsplatz" },
      abstieg: { places: 1, from: 4, to: 4, label: "Abstieg" },
    },
    playoffPlaces: playoff ? [3] : [],
  };
  const relegationPlayoff = playoff
    ? {
      exists: true,
      between: ["bl1:3", "bl2:3"],
      legs: 2,
      lastSeasonWithAwayGoals: "2020/21",
      firstSeasonWithout: "2021/22",
      awayGoalsApply: false,
      homeOrderRule: "fewerRestDaysBeforeFirstLegHostsSecondLeg",
      playoffDates: null,
      lastLeagueMatchdayDates: null,
      lotDrawn: null,
      parameterLeague: "bl1",
      extraTime: { factor: 1 / 3, applyDixonColes: false },
      penaltyPrior: 0.5,
    }
    : { exists: false };
  await fs.writeFile(
    path.join(dir, "seasons", String(SEASON), "config.json"),
    JSON.stringify({ season: SEASON, leagues: { bl1: leagueConfig, bl2: leagueConfig }, relegationPlayoff }, null, 2),
  );
  await fs.writeFile(
    path.join(dir, "season-params.json"),
    JSON.stringify({ procedureVersion: "track-c-part0-v1", params: {} }, null, 2),
  );
  return dir;
}

const silent = () => {};

// ---------------------------------------------------------------------------

test("a first run detects the season, archives, backfills and writes", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson, fetchText } = makeSources();
  const r = await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });

  assert.equal(r.changed, true);
  assert.equal(r.season, SEASON);
  assert.equal(r.dataUpdatedAt, NOW.toISOString());

  // The season was never hardcoded — it came from the source.
  const season = JSON.parse(await fs.readFile(path.join(dataDir, "seasons", String(SEASON), "bl1", "season.json"), "utf8"));
  assert.equal(season.season, SEASON);
  assert.equal(season.fixtures.length, 12);
  assert.equal(season.fixtures.filter((f) => f.gh !== undefined).length, 6);

  // Snapshots exist and carry both timestamps.
  const index = JSON.parse(await fs.readFile(path.join(dataDir, "ratings", "index.json"), "utf8"));
  assert.ok(index.snapshots.length > 1, "backfill plus today's snapshot");
  for (const s of index.snapshots) {
    assert.ok(s.observedAt && s.effectiveAt);
  }

  // Backfill covered the three played matchdays but not the future ones.
  assert.ok(r.backfill.dates.every((d) => d <= "2026-09-10"), "no future date may be backfilled");
  assert.ok(r.backfill.dates.length >= 3);
});

test("the pre-match dataset separates the two provenance groups", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson, fetchText } = makeSources();
  await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });

  const pm = JSON.parse(await fs.readFile(path.join(dataDir, "seasons", String(SEASON), "bl1", "prematch.json"), "utf8"));
  assert.ok(pm.entries.length > 0);
  // Everything here was reconstructed today for matches already played, so it
  // must be backfilled — never presentable as „die damalige Prognose".
  const played = pm.entries.filter((e) => e.kickoff < NOW.toISOString());
  assert.ok(played.length > 0);
  assert.ok(
    played.every((e) => e.provenance === "backfilled"),
    "ratings reconstructed after kickoff cannot be contemporaneous",
  );
  assert.ok(pm.entries.every((e) => e.ratingSnapshotId && e.rule && e.modelVersion));
});

test("re-running with unchanged data commits nothing and leaves dataUpdatedAt alone", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson, fetchText } = makeSources();
  const first = await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });
  assert.equal(first.changed, true);

  const before = await fs.readFile(path.join(dataDir, "meta.json"), "utf8");
  const later = new Date("2026-09-10T06:00:00.000Z");
  const second = await runUpdate({ dataDir, fetchJson, fetchText, now: later, log: silent });

  assert.equal(second.changed, false, "a check that found nothing new must not commit");
  assert.equal(second.dataUpdatedAt, first.dataUpdatedAt);
  assert.equal(await fs.readFile(path.join(dataDir, "meta.json"), "utf8"), before, "meta.json must be byte-identical");
});

test("a genuine data change moves dataUpdatedAt", async () => {
  const dataDir = await makeDataDir();
  const a = makeSources();
  await runUpdate({ dataDir, fetchJson: a.fetchJson, fetchText: a.fetchText, now: NOW, log: silent });

  // Matchday 4 is now played.
  const withMore = makeSources({
    bump: 5,
    results: (league, raw) => raw.map((m) => (m.group.groupOrderID === 4
      ? { ...m, matchIsFinished: true, matchResults: [{ resultTypeID: 2, pointsTeam1: 1, pointsTeam2: 3 }] }
      : m)),
  });
  const later = new Date("2026-09-19T04:00:00.000Z");
  const r = await runUpdate({ dataDir, fetchJson: withMore.fetchJson, fetchText: withMore.fetchText, now: later, log: silent });

  assert.equal(r.changed, true);
  assert.equal(r.dataUpdatedAt, later.toISOString());
  assert.ok(r.changes.some((c) => /fixtures\/results/.test(c)));
});

// §5.1: on failure nothing is committed and no status field is written.
test("a verification failure leaves the repository untouched", async () => {
  const dataDir = await makeDataDir();
  const broken = makeSources({ results: (league, raw) => raw.slice(0, 8) }); // truncated fetch
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson: broken.fetchJson, fetchText: broken.fetchText, now: NOW, log: silent }),
    /verification problem/,
  );

  const entries = await fs.readdir(dataDir);
  assert.ok(!entries.includes("ratings"), "no snapshot may be archived when a gate failed");
  assert.ok(!entries.includes("meta.json"), "no status field is written on failure");
});

test("an unresolvable club fails the job rather than guessing", async () => {
  const dataDir = await makeDataDir();
  const unknown = makeSources({
    results: (league, raw) => raw.map((m) => (m.matchID === 100
      ? { ...m, team1: { teamId: 99999, teamName: "SV Neuling", shortName: "Neuling" } }
      : m)),
  });
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson: unknown.fetchJson, fetchText: unknown.fetchText, now: NOW, log: silent }),
    /no clubelo mapping/,
  );
  assert.ok(!(await fs.readdir(dataDir)).includes("meta.json"));
});

test("a club missing from the clubelo snapshot blocks the commit", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson } = makeSources();
  const fetchText = async (url) => {
    if (/clubelo\.com\/\d{4}-\d{2}-\d{2}$/.test(url)) {
      return dailyCsv(url.split("/").pop()).split("\n").filter((l) => !l.startsWith("1,Bayern,")).join("\n");
    }
    return makeSources().fetchText(url);
  };
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent }),
    /no usable clubelo rating/,
  );
});

test("a missing season configuration stops the pipeline rather than inventing rules", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-pipe-"));
  const { fetchJson, fetchText } = makeSources();
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent }),
    /no season configuration/,
  );
});

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------

test("attachClubIds resolves every club and keeps both names", () => {
  const s = attachClubIds(normaliseSeason("bl1", SEASON, rawMatches("bl1")));
  assert.equal(s.clubs.length, 4);
  assert.ok(s.fixtures.every((f) => f.homeClubId && f.awayClubId && f.homeName && f.awayName));
});

test("extractRatings reports missing clubs instead of substituting", () => {
  const s = attachClubIds(normaliseSeason("bl1", SEASON, rawMatches("bl1")));
  const snapshot = {
    rows: [{ club: "Bayern", elo: 2000.9 }, { club: "Dortmund", elo: 1834.8 }],
  };
  const { ratings, missing } = extractRatings(s.clubs, snapshot);
  assert.deepEqual(Object.keys(ratings).sort(), ["Bayern", "Dortmund"]);
  assert.equal(missing.length, 2);
  // Structured, so the carry-forward step can work with club ids rather than
  // parsing a message back apart.
  assert.ok(missing.every((m) => m.clubId && m.name && m.clubeloCsvName));
  assert.ok(missing.some((m) => m.clubId === "Leverkusen"));
});

test("backfill brackets each matchday and never reaches into the future", () => {
  const fixtures = [
    { matchday: 1, kickoff: "2026-08-14T15:30:00Z" },
    { matchday: 1, kickoff: "2026-08-15T15:30:00Z" },
    { matchday: 2, kickoff: "2026-08-21T15:30:00Z" },
    { matchday: 6, kickoff: "2026-10-02T15:30:00Z" },
  ];
  const dates = backfillDates(fixtures, "2026-09-10");
  assert.deepEqual(dates, [
    "2026-08-13", // day before matchday 1 — the forecast rule's pre-match date
    "2026-08-14", // kickoff dates themselves — clubelo's pre-match value
    "2026-08-15",
    "2026-08-16", // day after matchday 1 — the direction gate's post value
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
  ]);
  // Matchday 6 is entirely in the future and must contribute nothing.
  assert.ok(dates.every((d) => d <= "2026-09-10"), "a future date cannot have been published");
  assert.ok(!dates.some((d) => d.startsWith("2026-10")));
});

// v5.7 Part 2.4 — the backfill is the only path that hits clubelo dozens of
// times in a row, so it pauses between requests. Tests must never loop against
// the live API, so the delay is injectable and set to 0 here.
test("the backfill pauses between clubelo requests", async () => {
  assert.equal(BACKFILL_DELAY_MS, 750, "the politeness delay must be present and non-trivial");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-delay-"));
  const stamps = [];
  const fetchText = async (url) => {
    stamps.push(Date.now());
    const club = [...CLUBS.bl1, ...CLUBS.bl2].find((c) => c.csv.replace(/\s/g, "") === url.split("/").pop());
    return clubHistoryCsv(club ?? CLUBS.bl1[0]);
  };

  const clubs = CLUBS.bl1.map((c) => ({ clubId: c.shortName, clubeloUrlName: c.csv.replace(/\s/g, "") }));
  await backfillSnapshots({
    ratingsDir: dir, clubs, dates: ["2026-06-01"], observedAt: "2026-06-01T04:00:00.000Z",
    fetchText, delayMs: 40,
  });

  assert.equal(stamps.length, clubs.length);
  for (let i = 1; i < stamps.length; i++) {
    assert.ok(stamps[i] - stamps[i - 1] >= 35, `no pause between request ${i - 1} and ${i}`);
  }
});

// v5.7 Part 2.5 — pointing the archive elsewhere is a configuration change.
test("the ratings archive can be relocated by configuration alone", async () => {
  const dataDir = await makeDataDir();
  const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), "bl-archive-"));
  const { fetchJson, fetchText } = makeSources();

  await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent, ratingsDir: elsewhere });

  // The archive landed at the configured base, not under data/.
  assert.ok((await fs.readdir(elsewhere)).includes("index.json"));
  assert.ok(!(await fs.readdir(dataDir)).includes("ratings"));
  // And the derived data still resolved against it.
  const pm = JSON.parse(await fs.readFile(path.join(dataDir, "seasons", String(SEASON), "bl1", "prematch.json"), "utf8"));
  assert.ok(pm.entries.length > 0);
});

// ---------------------------------------------------------------------------
// v5.7 Addendum 2.6 — bounded carry-forward. Fail-closed stays the default.
// ---------------------------------------------------------------------------

/** Sources where one club has vanished from the daily CSV, as clubelo did. */
function makeSourcesWithMissingClub(missingCsvName) {
  const s = makeSources();
  const fetchText = async (url) => {
    const text = await s.fetchText(url);
    if (/clubelo\.com\/\d{4}-\d{2}-\d{2}$/.test(url)) {
      return text.split("\n").filter((l) => !l.startsWith(`1,${missingCsvName},`)).join("\n");
    }
    return text;
  };
  return { fetchJson: s.fetchJson, fetchText };
}

test("a club absent from the snapshot still fails the job without the flag", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson, fetchText } = makeSourcesWithMissingClub("Bayern");
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent }),
    /no usable clubelo rating/,
  );
  assert.ok(!(await fs.readdir(dataDir)).includes("meta.json"), "nothing may be written");
});

test("with the flag the club is carried, marked, and the archive stays truthful", async () => {
  const dataDir = await makeDataDir();
  // First a clean run, so the archive holds a rating for every club.
  const clean = makeSources();
  await runUpdate({ dataDir, fetchJson: clean.fetchJson, fetchText: clean.fetchText, now: NOW, log: silent });

  // Now Bayern vanishes from the daily CSV, one day later.
  const later = new Date("2026-09-11T04:00:00.000Z");
  const gone = makeSourcesWithMissingClub("Bayern");
  const messages = [];
  const r = await runUpdate({
    dataDir, fetchJson: gone.fetchJson, fetchText: gone.fetchText, now: later,
    carryForwardUntil: "2026-10-31", log: (m) => messages.push(m),
  });

  assert.equal(r.carried.length, 1);
  assert.equal(r.carried[0].clubId, "Bayern");
  assert.equal(r.carried[0].effectiveAt, "2026-09-10", "the real date of the rating, not today");
  assert.equal(r.carried[0].ageDays, 1);

  // Logged loudly, so the Actions notification is a truthful record.
  assert.ok(messages.some((m) => /CARRIED FORWARD/.test(m)));

  // The outlook marks it per club; every other club stays live.
  const outlook = JSON.parse(await fs.readFile(path.join(dataDir, "seasons", String(SEASON), "bl1", "outlook.json"), "utf8"));
  assert.equal(outlook.ratingProvenance.Bayern.provenance, "carried-forward");
  assert.equal(outlook.ratingProvenance.Bayern.effectiveAt, "2026-09-10");
  assert.equal(outlook.ratingProvenance.Dortmund.provenance, "live");

  // The ARCHIVE records what clubelo actually published — no fabricated row.
  const index = JSON.parse(await fs.readFile(path.join(dataDir, "ratings", "index.json"), "utf8"));
  const todaySnap = index.snapshots.find((s) => s.effectiveAt === "2026-09-11");
  const snap = JSON.parse(await fs.readFile(
    path.join(dataDir, "ratings", "snapshots", `${todaySnap.snapshotId}.json`), "utf8",
  ));
  assert.equal(snap.ratings.Bayern, undefined, "a carried value must never enter the archive as an observation");
  assert.ok(snap.ratings.Dortmund !== undefined);
});

test("the marker is self-clearing — once clubelo lists the club again it is live", async () => {
  const dataDir = await makeDataDir();
  const clean = makeSources();
  await runUpdate({ dataDir, fetchJson: clean.fetchJson, fetchText: clean.fetchText, now: NOW, log: silent });

  const gone = makeSourcesWithMissingClub("Bayern");
  await runUpdate({
    dataDir, fetchJson: gone.fetchJson, fetchText: gone.fetchText,
    now: new Date("2026-09-11T04:00:00.000Z"), carryForwardUntil: "2026-10-31", log: silent,
  });

  // clubelo resumes. No manual reset, no migration.
  const back = makeSources({ bump: 3 });
  const r = await runUpdate({
    dataDir, fetchJson: back.fetchJson, fetchText: back.fetchText,
    now: new Date("2026-09-12T04:00:00.000Z"), carryForwardUntil: "2026-10-31", log: silent,
  });
  assert.deepEqual(r.carried, []);
  const outlook = JSON.parse(await fs.readFile(path.join(dataDir, "seasons", String(SEASON), "bl1", "outlook.json"), "utf8"));
  assert.equal(outlook.ratingProvenance.Bayern.provenance, "live");
});

test("a club with an intervening known fixture is not carried, flag or not", async () => {
  const dataDir = await makeDataDir();
  const clean = makeSources();
  await runUpdate({ dataDir, fetchJson: clean.fetchJson, fetchText: clean.fetchText, now: NOW, log: silent });

  // Matchday 4 is on 2026-09-18; asking on the 19th puts a played fixture in
  // the gap, so the step-function argument no longer holds.
  const gone = makeSourcesWithMissingClub("Bayern");
  await assert.rejects(
    () => runUpdate({
      dataDir, fetchJson: gone.fetchJson, fetchText: gone.fetchText,
      now: new Date("2026-09-19T04:00:00.000Z"), carryForwardUntil: "2026-10-31", log: silent,
    }),
    /known fixture\(s\) fall between/,
  );
});

// ---------------------------------------------------------------------------
//  The relegation play-off artefact (§6) — written by the run, at season level.
// ---------------------------------------------------------------------------

test("a season without a play-off still gets an artefact that says so", async () => {
  const dataDir = await makeDataDir();
  const { fetchJson, fetchText } = makeSources();
  await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });

  const file = path.join(dataDir, "seasons", String(SEASON), "playoff.json");
  const playoff = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(playoff.exists, false);
  assert.deepEqual(playoff.pairings, []);
  // An ABSENT file and a season without a play-off would be indistinguishable.
  assert.ok(playoff.reason);
});

test("the play-off artefact is written once at season level and both views agree", async () => {
  const dataDir = await makeDataDir({ playoff: true });
  const { fetchJson, fetchText } = makeSources();
  const r = await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });
  assert.ok(r.changes.includes("relegation play-off"));

  const seasonDir = path.join(dataDir, "seasons", String(SEASON));
  const playoff = JSON.parse(await fs.readFile(path.join(seasonDir, "playoff.json"), "utf8"));
  assert.equal(playoff.exists, true);

  // One file, not one per league: a per-league copy could drift.
  for (const league of ["bl1", "bl2"]) {
    await assert.rejects(() => fs.readFile(path.join(seasonDir, league, "playoff.json"), "utf8"));
  }

  // Four clubs per league, so every pairing is present.
  assert.equal(playoff.pairings.length, 16);
  for (const p of playoff.pairings) assert.ok(Object.is(p.pBl2Wins, 1 - p.pBl1Wins));

  // Both league views exist and compose out of those same numbers.
  const bl1Outlook = JSON.parse(await fs.readFile(path.join(seasonDir, "bl1", "outlook.json"), "utf8"));
  for (const club of bl1Outlook.clubs) {
    const v = playoff.bl1[club];
    assert.ok(v.pKlassenerhalt >= v.pSafe);
    assert.ok(v.pKlassenerhalt <= v.pSafe + v.pRelegationPlayoff + 1e-12);
  }
  for (const v of Object.values(playoff.bl2)) {
    assert.ok(v.pAufstieg >= v.pDirect);
    assert.ok(v.pAufstieg <= v.pDirect + v.pPlayoffPlace + 1e-12);
  }
});

test("an unchanged data state rewrites nothing, including the play-off", async () => {
  const dataDir = await makeDataDir({ playoff: true });
  const { fetchJson, fetchText } = makeSources();
  await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });
  const again = await runUpdate({ dataDir, fetchJson, fetchText, now: NOW, log: silent });
  assert.equal(again.changed, false);
  assert.ok(!again.changes.includes("relegation play-off"));
});

// ---------------------------------------------------------------------------
//  Fetch economy (Brief 6 §2): at most one clubelo request per day.
//
//  The courtesy rule the operator's permission came with — „access as sparingly
//  as possible" — is checked here rather than trusted. What is counted is the
//  actual URLs the run asked for.
// ---------------------------------------------------------------------------

const dailyCalls = (calls) => calls.text.filter((u) => /clubelo\.com\/\d{4}-\d{2}-\d{2}$/.test(u));

test("the second run of a day does not ask clubelo again, and says so", async () => {
  const dataDir = await makeDataDir();
  const s = makeSources();

  const first = [];
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: (m) => first.push(m) });
  const afterFirst = dailyCalls(s.calls).length;
  assert.ok(afterFirst >= 1, "the first run of a day must fetch the daily CSV");
  assert.ok(!first.some((m) => /kein Abruf/.test(m)));

  const second = [];
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: (m) => second.push(m) });
  assert.equal(dailyCalls(s.calls).length, afterFirst, "the second run must not fetch the daily CSV at all");
  // A run's log still accounts for every source, including the one not used.
  assert.ok(second.some((m) => m === "clubelo: Tagesstand vorhanden, kein Abruf"));
});

test("a new day fetches again — the skip is per day, not permanent", async () => {
  const dataDir = await makeDataDir();
  const s = makeSources();
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent });
  const afterFirstDay = dailyCalls(s.calls).length;

  const nextDay = new Date(NOW.getTime() + 24 * 3600 * 1000);
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: nextDay, log: silent });
  assert.equal(dailyCalls(s.calls).length, afterFirstDay + 1, "exactly one further request, for the new day");
});

test("twelve runs in one day cost one request, not twelve", async () => {
  const dataDir = await makeDataDir();
  const s = makeSources();
  for (let i = 0; i < 12; i++) {
    await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent });
  }
  assert.equal(dailyCalls(s.calls).length, 1, `${dailyCalls(s.calls).length} daily requests for one day`);
});

test("the archived ratings are the same ratings — the skip is not a degraded mode", async () => {
  const dataDir = await makeDataDir();
  const s = makeSources();
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent });
  const file = path.join(dataDir, "seasons", String(SEASON), "bl1", "outlook.json");
  const afterFetch = JSON.parse(await fs.readFile(file, "utf8")).ratings;

  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent });
  const afterSkip = JSON.parse(await fs.readFile(file, "utf8")).ratings;
  assert.deepEqual(afterSkip, afterFetch);
  for (const v of Object.values(afterSkip)) assert.ok(Number.isFinite(v));
});

test("reading from the archive stays fail-closed, and honours a correction", async () => {
  const dataDir = await makeDataDir();
  const s = makeSources();
  await runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent });

  const ratingsDir = path.join(dataDir, "ratings");
  const { readIndex, readSnapshot, appendSnapshot, findSnapshotOn } = await import("../src/snapshots.mjs");
  const today = NOW.toISOString().slice(0, 10);
  const current = await readSnapshot(ratingsDir, findSnapshotOn(await readIndex(ratingsDir), today).snapshotId);

  // A later observation of the SAME day that no longer carries one club. The
  // archive never edits its predecessor, so this is a correction sitting beside
  // it — and the run must read the corrected one, not the first one listed.
  const [dropped] = Object.keys(current.ratings);
  const rest = { ...current.ratings };
  delete rest[dropped];
  const correction = await appendSnapshot(ratingsDir, {
    source: "clubelo",
    observedAt: new Date(NOW.getTime() + 3600 * 1000).toISOString(),
    effectiveAt: today,
    ratings: rest,
  });
  assert.equal(correction.appended, true);
  assert.equal(findSnapshotOn(await readIndex(ratingsDir), today).snapshotId, correction.snapshotId);

  // Second run of the same day: no fetch, reads the correction — and the missing
  // club fails the job exactly as a missing club in a fresh CSV would.
  const before = dailyCalls(s.calls).length;
  await assert.rejects(
    () => runUpdate({ dataDir, fetchJson: s.fetchJson, fetchText: s.fetchText, now: NOW, log: silent }),
    /no usable clubelo rating/,
  );
  assert.equal(dailyCalls(s.calls).length, before, "it must fail closed without asking clubelo to rescue it");
});
