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

async function makeDataDir() {
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
      abstieg: { places: 1, from: 4, to: 4, label: "Abstieg" },
    },
  };
  await fs.writeFile(
    path.join(dir, "seasons", String(SEASON), "config.json"),
    JSON.stringify({ season: SEASON, leagues: { bl1: leagueConfig, bl2: leagueConfig } }, null, 2),
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
    /have no clubelo rating/,
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
  assert.ok(missing.some((m) => /Leverkusen/.test(m)));
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
