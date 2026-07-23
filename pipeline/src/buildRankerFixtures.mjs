#!/usr/bin/env node
/**
 * Build the ranker's acceptance fixtures: for a range of completed seasons and
 * both divisions, the played matches plus OpenLigaDB's OFFICIAL final table.
 *
 *   node pipeline/src/buildRankerFixtures.mjs [firstSeason] [lastSeason]
 *
 * The official table is the oracle for the V1 acceptance criterion "table
 * ranker reproduces real final tables with tiebreak tests". Committed so the
 * test suite runs offline (§5.5 pins everything it can).
 *
 * Data: OpenLigaDB, Open Database License (ODbL) — see
 * docs/verification/openligadb.md.
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../../packages/engine/tests/fixtures");
const UA = "bundesliga-app/0.1 (+https://github.com/manganite/bundesliga)";
const FIRST = Number(process.argv[2] ?? 2015);
const LAST = Number(process.argv[3] ?? 2025);
const POLITE_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await sleep(POLITE_MS);
  return res.json();
}

async function buildSeason(league, season) {
  const matches = await get(`https://api.openligadb.de/getmatchdata/${league}/${season}`);
  const table = await get(`https://api.openligadb.de/getbltable/${league}/${season}`);

  const finished = matches.filter((m) => m.matchIsFinished);
  if (finished.length !== matches.length) return null; // season not complete

  const played = finished.map((m) => {
    const final = m.matchResults.find((r) => r.resultTypeID === 2) // "Endergebnis"
      ?? m.matchResults.find((r) => r.resultName === "Endergebnis");
    if (!final) throw new Error(`no final result for match ${m.matchID}`);
    return {
      home: String(m.team1.teamId),
      away: String(m.team2.teamId),
      gh: final.pointsTeam1,
      ga: final.pointsTeam2,
    };
  });

  return {
    league,
    season,
    source: {
      matches: `OpenLigaDB api.openligadb.de/getmatchdata/${league}/${season}`,
      officialTable: `OpenLigaDB api.openligadb.de/getbltable/${league}/${season}`,
      licence: "ODbL 1.0",
      retrieved: new Date().toISOString().slice(0, 10),
    },
    clubs: table.map((r) => ({ id: String(r.teamInfoId), name: r.teamName })),
    // OpenLigaDB returns the table already in official order.
    officialOrder: table.map((r) => String(r.teamInfoId)),
    officialRows: table.map((r) => ({
      id: String(r.teamInfoId),
      pts: r.points,
      gf: r.goals,
      ga: r.opponentGoals,
      gd: r.goalDiff,
      played: r.matches,
    })),
    matches: played,
  };
}

await fs.mkdir(OUT, { recursive: true });
const index = [];
for (const league of ["bl1", "bl2"]) {
  for (let s = FIRST; s <= LAST; s++) {
    try {
      const data = await buildSeason(league, s);
      if (!data) {
        process.stderr.write(`skip ${league} ${s}: season not complete\n`);
        continue;
      }
      const file = `${league}-${s}.json`;
      await fs.writeFile(path.join(OUT, file), `${JSON.stringify(data)}\n`);
      index.push(file);
      process.stderr.write(`ok   ${league} ${s}: ${data.matches.length} matches, ${data.clubs.length} clubs\n`);
    } catch (e) {
      process.stderr.write(`FAIL ${league} ${s}: ${e.message}\n`);
    }
  }
}
await fs.writeFile(path.join(OUT, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
process.stderr.write(`\n${index.length} season fixtures written to ${OUT}\n`);
