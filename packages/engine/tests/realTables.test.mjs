import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTable, rankTable } from "../src/ranking.mjs";

// V1 acceptance criterion: "Table ranker reproduces real final tables with
// tiebreak tests." The oracle is OpenLigaDB's official end-of-season table for
// 22 completed seasons across both divisions (2015/16–2025/26), committed under
// tests/fixtures by pipeline/src/buildRankerFixtures.mjs.
//
// A final table has every leg played, so the in-season rules are inactive here
// and criteria 1)–5) carry the whole load. Criterion 6) (Entscheidungsspiel)
// has not occurred in any of these seasons — asserted below rather than
// assumed.
//
// HOW FAR THIS TEST REACHES — measured, not assumed. Across all 22 seasons,
// 6 needed criterion 2) (goals scored) and **none needed criterion 3) or
// beyond**: no final table in this window had two clubs level on points, goal
// difference AND goals scored. So this test validates the entry criterion and
// criteria 1)–2) against reality, and it does NOT discriminate between the
// Spielordnung's direct-comparison chain and brief §6's incorrect one — both
// would pass. The head-to-head criteria are covered only by the synthetic cases
// in ranking.test.mjs, which are constructed specifically to separate the two
// readings. Widening the window (V2 reaches back to 1995/96) is the way to get
// real coverage of criteria 3)–5); until then, the claim "verified against real
// tables" must not be extended to them.

const DIR = path.resolve(import.meta.dirname, "fixtures");
const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const seasons = index.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

test("fixtures are present", () => {
  assert.ok(seasons.length >= 20, `only ${seasons.length} season fixtures`);
});

for (const s of seasons) {
  const label = `${s.league} ${s.season}/${String(s.season + 1).slice(2)}`;

  test(`${label}: table totals match the official table`, () => {
    const clubIds = s.clubs.map((c) => c.id);
    const table = buildTable(clubIds, s.matches);
    const byId = new Map(table.map((r) => [r.clubId, r]));
    for (const off of s.officialRows) {
      const mine = byId.get(off.id);
      assert.ok(mine, `club ${off.id} missing`);
      assert.equal(mine.pts, off.pts, `points for ${off.id}`);
      assert.equal(mine.gf, off.gf, `goals for ${off.id}`);
      assert.equal(mine.ga, off.ga, `goals against ${off.id}`);
      assert.equal(mine.gd, off.gd, `goal difference for ${off.id}`);
      assert.equal(mine.played, off.played, `matches played for ${off.id}`);
    }
  });

  test(`${label}: ranker reproduces the official final order`, () => {
    const clubIds = s.clubs.map((c) => c.id);
    const table = buildTable(clubIds, s.matches);
    // No decider is supplied: if criteria 1)–5) left a genuine tie, the ranker
    // shares the position and the order comparison below would fail loudly
    // rather than a random key papering over it.
    const ranked = rankTable(table, s.matches, { inSeason: false });

    assert.ok(
      ranked.every((r) => !r.sharedRank),
      `${label}: criteria 1)–5) left a tie — would need an Entscheidungsspiel`,
    );

    const name = new Map(s.clubs.map((c) => [c.id, c.name]));
    const mine = ranked.map((r) => r.clubId);
    if (mine.join() !== s.officialOrder.join()) {
      const rows = mine.map((id, i) => {
        const off = s.officialOrder[i];
        const flag = id === off ? "  " : "!!";
        return `${flag} ${String(i + 1).padStart(2)}. mine=${name.get(id)}  official=${name.get(off)}`;
      });
      assert.fail(`${label}: order differs\n${rows.join("\n")}`);
    }
  });
}
