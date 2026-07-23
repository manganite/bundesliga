#!/usr/bin/env node
/**
 * Collect every distinct OpenLigaDB club across a season range and both
 * divisions, so the §5.2 mapping test runs offline against real club records —
 * including the awkward ones (blank shortName, umlauts, the ambiguous name
 * pairs).
 *
 *   node pipeline/src/buildClubFixtures.mjs [first] [last]
 */
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../tests/fixtures");
const UA = "bundesliga-app/0.1 (+https://github.com/manganite/bundesliga)";
const FIRST = Number(process.argv[2] ?? 2015);
const LAST = Number(process.argv[3] ?? 2026);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await sleep(250);
  return res.json();
}

const byId = new Map();
for (const league of ["bl1", "bl2"]) {
  for (let s = FIRST; s <= LAST; s++) {
    let matches;
    try {
      matches = await get(`https://api.openligadb.de/getmatchdata/${league}/${s}`);
    } catch (e) {
      process.stderr.write(`skip ${league} ${s}: ${e.message}\n`);
      continue;
    }
    for (const m of matches) {
      for (const t of [m.team1, m.team2]) {
        if (!byId.has(t.teamId)) {
          byId.set(t.teamId, {
            teamId: t.teamId,
            teamName: t.teamName,
            shortName: t.shortName ?? null,
            seenIn: [],
          });
        }
        const rec = byId.get(t.teamId);
        const tag = `${league}-${s}`;
        if (!rec.seenIn.includes(tag)) rec.seenIn.push(tag);
      }
    }
    process.stderr.write(`ok ${league} ${s}\n`);
  }
}

const clubs = [...byId.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(
  path.join(OUT, "clubs.json"),
  `${JSON.stringify({
    _comment: "Every distinct OpenLigaDB club across the season range, for the §5.2 mapping test.",
    source: "OpenLigaDB api.openligadb.de/getmatchdata/<league>/<season>, ODbL 1.0",
    retrieved: new Date().toISOString().slice(0, 10),
    seasonRange: [FIRST, LAST],
    clubs,
  }, null, 2)}\n`,
);
process.stderr.write(`\n${clubs.length} distinct clubs written\n`);
