import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadRelegation, validateEntry, aggregateOf, relegationForSeason, BOUNDARIES } from "../src/relegation.mjs";
import { loadClubRegister } from "../src/clubRegister.mjs";

// ============================================================================
//  Relegation record (§V2b.1 G1). The curated results must be internally
//  consistent (aggregate = leg sum, the decision method matches the score) and
//  must agree with the OpenLigaDB anchors for the two seasons OpenLigaDB carries.
//  A wrong result here would put a false fact in the archive season balance.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const relegation = await loadRelegation(path.join(REPO, "data"));
const register = await loadClubRegister(path.join(REPO, "data"));

// --- rosters, from data we already have (training tables + the 2026 season) ---

/** The set of clubIds (training short-names) that played a league-season. */
function trainingRoster(league, year) {
  const file = path.join(REPO, "data/training/results", `${league}-${year}.json`);
  if (!fs.existsSync(file)) return null;
  const ids = new Set();
  for (const m of JSON.parse(fs.readFileSync(file, "utf8")).matches) { ids.add(m.home); ids.add(m.away); }
  return ids;
}

/** The 2026/27 rosters come from the committed live season, not the training set. */
function seasonRoster(league, year) {
  const file = path.join(REPO, `data/seasons/${year}/${league}/season.json`);
  if (!fs.existsSync(file)) return null;
  return new Set(JSON.parse(fs.readFileSync(file, "utf8")).clubs.map((c) => c.clubId));
}

const roster = (league, year) => trainingRoster(league, year) ?? seasonRoster(league, year);

/**
 * Resolve a relegation participant's full name to a clubId, or null when the club
 * is outside our universe (a 3. Liga side). Matches against the register's names:
 * exact, or one is a substring of the other — robust to „FC Erzgebirge Aue" vs
 * „Erzgebirge Aue" and „Hamburger SV" (whose clubId „HSV" is not a substring).
 * Ambiguity throws, so a silent mis-resolution can't weaken the check.
 */
function resolveClubId(fullName) {
  const hits = Object.entries(register.clubs).filter(([clubId, e]) => {
    const n = e.name;
    return n === fullName || fullName.includes(n) || fullName.includes(clubId);
  });
  if (hits.length > 1) throw new Error(`ambiguous relegation club "${fullName}": ${hits.map((h) => h[0]).join(", ")}`);
  return hits.length ? hits[0][0] : null;
}

test("every season 2011/12–2025/26 has both relegation boundaries", () => {
  for (let year = 2011; year <= 2025; year++) {
    const s = relegationForSeason(relegation, year);
    assert.ok(s, `season ${year} missing`);
    for (const b of BOUNDARIES) assert.ok(s[b], `season ${year} missing ${b}`);
  }
});

test("loadRelegation already validated every entry — aggregate, winner, decision method", () => {
  // loadRelegation throws on any inconsistency, so reaching here means all 30
  // entries are internally consistent. Re-assert a couple of tricky ones.
  const awayGoals = relegation.seasons["2018"]["bl1-bl2"]; // Stuttgart–Union, 2:2, Union on away goals
  assert.equal(awayGoals.decidedBy, "awayGoals");
  const { goalsA, goalsB } = aggregateOf(awayGoals);
  assert.equal(goalsA, goalsB, "an away-goals tie must be level on aggregate");
  assert.equal(awayGoals.winner, "1. FC Union Berlin");

  const penalties = relegation.seasons["2023"]["bl1-bl2"]; // Bochum–Düsseldorf, 3:3, Bochum on penalties
  assert.equal(penalties.decidedBy, "penalties");
  assert.equal(penalties.winner, "VfL Bochum");
});

test("the OpenLigaDB anchors match: 2024/25 and 2025/26 BL1/BL2", () => {
  // These two are the ground truth from OpenLigaDB rel/2024 and rel/2025.
  const a = relegation.seasons["2024"]["bl1-bl2"];
  assert.deepEqual(a.legs, [
    { home: "1. FC Heidenheim", away: "SV Elversberg", gh: 2, ga: 2 },
    { home: "SV Elversberg", away: "1. FC Heidenheim", gh: 1, ga: 2 },
  ]);
  assert.equal(a.winner, "1. FC Heidenheim");

  const b = relegation.seasons["2025"]["bl1-bl2"];
  assert.deepEqual(b.legs, [
    { home: "VfL Wolfsburg", away: "SC Paderborn 07", gh: 0, ga: 0 },
    { home: "SC Paderborn 07", away: "VfL Wolfsburg", gh: 2, ga: 1 },
  ]);
  assert.equal(b.winner, "SC Paderborn 07");
});

test("validateEntry is fail-closed on a wrong aggregate", () => {
  assert.throws(() => validateEntry("test", "bl1-bl2", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 0 }, { home: "B", away: "A", gh: 0, ga: 0 }],
    aggregate: "9:9", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /aggregate 9:9 ≠ leg sum 1:0/);
});

test("validateEntry is fail-closed when the decision method contradicts the score", () => {
  // Level aggregate but claimed decided „regular" (goals) → must throw.
  assert.throws(() => validateEntry("test", "bl2-3liga", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 1 }, { home: "B", away: "A", gh: 0, ga: 0 }],
    aggregate: "1:1", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /winner does not lead/);
});

test("validateEntry is fail-closed when leg 2 is not the reverse fixture", () => {
  assert.throws(() => validateEntry("test", "bl1-bl2", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 0 }, { home: "A", away: "C", gh: 0, ga: 0 }],
    aggregate: "1:0", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /leg 2 .* is not the reverse of leg 1/);
});

test("every entry cites a source", () => {
  for (const boundaries of Object.values(relegation.seasons)) {
    for (const b of BOUNDARIES) assert.ok(boundaries[b].source, `${b} lacks a source`);
  }
});

// ---------------------------------------------------------------------------
//  Roster sanity check (per user request): not the exact scores, but that the
//  PARTICIPANTS come from the right tables of season Y, and the WINNER/LOSER are
//  consistent with the rosters of season Y+1. Uses only data we already have —
//  the training tables (2011–2025) and the committed 2026/27 season.
// ---------------------------------------------------------------------------

test("sanity: bl1-bl2 participants come from BL1(Y)/BL2(Y) and the winner plays BL1(Y+1)", () => {
  for (let Y = 2011; Y <= 2025; Y++) {
    const e = relegation.seasons[String(Y)]["bl1-bl2"];
    const winner = resolveClubId(e.winner);
    const loser = resolveClubId(e.loser);
    assert.ok(winner && loser, `${Y} bl1-bl2: both clubs should be in our universe (${e.winner} / ${e.loser})`);
    const bl1 = roster("bl1", Y);
    const bl2 = roster("bl2", Y);
    // One participant is the BL1 side (≈16th), the other the BL2 side (≈3rd).
    assert.equal([winner, loser].filter((c) => bl1.has(c)).length, 1, `${Y}: one bl1-bl2 participant from BL1(${Y})`);
    assert.equal([winner, loser].filter((c) => bl2.has(c)).length, 1, `${Y}: one bl1-bl2 participant from BL2(${Y})`);
    // Outcome: the winner plays BL1 next season, the loser does not.
    const bl1next = roster("bl1", Y + 1);
    if (bl1next) {
      assert.ok(bl1next.has(winner), `${Y}: winner ${winner} should play BL1 in ${Y + 1}`);
      assert.ok(!bl1next.has(loser), `${Y}: loser ${loser} should NOT play BL1 in ${Y + 1}`);
    }
  }
});

test("sanity: bl2-3liga has exactly one BL2(Y) side, and the outcome matches BL2(Y+1)", () => {
  for (let Y = 2011; Y <= 2025; Y++) {
    const e = relegation.seasons[String(Y)]["bl2-3liga"];
    const winner = resolveClubId(e.winner);
    const loser = resolveClubId(e.loser);
    const bl2 = roster("bl2", Y);
    const bl2Side = [winner, loser].filter(Boolean).filter((c) => bl2.has(c));
    assert.equal(bl2Side.length, 1, `${Y} bl2-3liga: exactly one participant from BL2(${Y})`);
    const bl2SideId = bl2Side[0];
    const bl2next = roster("bl2", Y + 1);
    if (!bl2next) continue;
    if (winner === bl2SideId) {
      // The BL2 club held its place → still in BL2 next season.
      assert.ok(bl2next.has(bl2SideId), `${Y}: BL2 side ${bl2SideId} stayed → in BL2(${Y + 1})`);
    } else {
      // The BL2 club lost to the 3. Liga side → drops out of BL2 next season.
      assert.ok(!bl2next.has(bl2SideId), `${Y}: BL2 side ${bl2SideId} lost → not in BL2(${Y + 1})`);
      if (winner) assert.ok(bl2next.has(winner), `${Y}: promoted ${winner} → in BL2(${Y + 1})`);
    }
  }
});
