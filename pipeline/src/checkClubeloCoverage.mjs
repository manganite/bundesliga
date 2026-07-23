#!/usr/bin/env node
/**
 * §11 gate: does every club of the current season resolve to a clubelo rating?
 *
 *   node pipeline/src/checkClubeloCoverage.mjs [YYYY-MM-DD] [season]
 *
 * Exits non-zero when a club is unresolved — the same fail-closed rule the data
 * pipeline applies (§5.2). Findings are written up in
 * docs/verification/clubelo.md; re-run this to refresh them.
 */
import { resolveClub, ClubResolutionError } from "./clubMapping.mjs";

const UA = "bundesliga-app/0.1 (+https://github.com/manganite/bundesliga)";
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);

const text = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
};
const json = async (url) => JSON.parse(await text(url));

// The daily all-clubs snapshot, keyed by clubelo's CSV `Club` column.
const rows = (await text(`http://api.clubelo.com/${date}`)).trim().split("\n");
const snapshot = new Map(
  rows.slice(1).map((l) => {
    const [rank, club, country, level, elo, from, to] = l.split(",");
    return [club, { rank, country, level, elo: Number(elo), from, to }];
  }),
);
console.log(`clubelo snapshot ${date}: ${snapshot.size} clubs\n`);

// Season is detected, never hardcoded (§5.5).
const current = await json("https://api.openligadb.de/getmatchdata/bl1");
const season = Number(process.argv[3] ?? current[0].leagueSeason);
console.log(`detected season: ${season}/${String(season + 1).slice(2)}\n`);

let failures = 0;
for (const league of ["bl1", "bl2"]) {
  const matches = await json(`https://api.openligadb.de/getmatchdata/${league}/${season}`);
  const teams = new Map();
  for (const m of matches) for (const t of [m.team1, m.team2]) teams.set(t.teamId, t);

  const unresolved = [];
  const seenRatingKey = new Map();
  let ok = 0;

  for (const team of [...teams.values()].sort((a, b) => a.teamName.localeCompare(b.teamName))) {
    let club;
    try {
      club = resolveClub(team);
    } catch (e) {
      if (!(e instanceof ClubResolutionError)) throw e;
      unresolved.push(`${team.teamName.padEnd(26)} ${e.message}`);
      continue;
    }

    const clash = seenRatingKey.get(club.clubeloUrlName);
    if (clash) unresolved.push(`${team.teamName} collides with ${clash} on "${club.clubeloUrlName}"`);
    seenRatingKey.set(club.clubeloUrlName, team.teamName);

    const hit = snapshot.get(club.clubeloCsvName);
    if (hit) {
      ok++;
      continue;
    }
    // Present in the mapping but not in today's snapshot: say whether the club
    // exists at all and how far its history reaches, so a genuine coverage gap
    // is distinguishable from a naming error.
    let detail;
    try {
      const hist = (await text(`http://api.clubelo.com/${club.clubeloUrlName}`)).trim().split("\n").filter(Boolean);
      const last = hist[hist.length - 1].split(",");
      detail = `history ends ${last[6]} (elo ${Number(last[4]).toFixed(1)})`;
    } catch (e) {
      detail = `no clubelo history: ${e.message}`;
    }
    unresolved.push(`${team.teamName.padEnd(26)} clubelo "${club.clubeloCsvName}" absent on ${date} — ${detail}`);
  }

  console.log(`=== ${league} ${season} — ${teams.size} clubs — resolved ${ok}/${teams.size} ===`);
  for (const u of unresolved) console.log(`  ✗ ${u}`);
  if (!unresolved.length) console.log("  ✓ every club resolves");
  console.log();
  failures += unresolved.length;
}

if (failures) {
  console.error(
    `${failures} club(s) unresolved. Under §5.2 the pipeline fails and commits nothing:\n` +
      "a wrong rating is worse than a missing one because it is silent.",
  );
  process.exit(1);
}
console.log("all clubs resolve — gate passed");
