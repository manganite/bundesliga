import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resolveClub, resolveAll, canonicalShortName, ClubResolutionError,
} from "../src/clubMapping.mjs";

// §5.2 requires exactly these two assertions: every fixture club resolves, and
// no two clubs map to the same rating key. The fixture holds every distinct
// OpenLigaDB club of both divisions from 2015/16 to 2026/27.
const fixture = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "fixtures/clubs.json"), "utf8"),
);

test("every club of both divisions since 2015/16 resolves", () => {
  const failed = [];
  for (const club of fixture.clubs) {
    try {
      resolveClub(club);
    } catch (e) {
      failed.push(`${club.teamName} (id ${club.teamId}, shortName ${JSON.stringify(club.shortName)}): ${e.message}`);
    }
  }
  assert.deepEqual(failed, [], `${failed.length} club(s) unresolved:\n${failed.join("\n")}`);
});

test("no two clubs share a clubelo rating key", () => {
  // One-to-one between CLUB IDENTITY and rating key. Not between OpenLigaDB
  // teamId and rating key: OpenLigaDB carries two ids for Würzburger Kickers
  // (398 and 4437), and those legitimately share one clubelo history.
  const byKey = new Map();
  for (const club of fixture.clubs) {
    const r = resolveClub(club);
    const clash = byKey.get(r.clubeloUrlName);
    if (clash && clash !== r.clubId) {
      assert.fail(
        `club "${clash}" and club "${r.clubId}" ("${club.teamName}") both map to clubelo "${r.clubeloUrlName}"`,
      );
    }
    byKey.set(r.clubeloUrlName, r.clubId);
  }
});

test("two OpenLigaDB ids for one club fold into a single identity", () => {
  const wuerzburg = fixture.clubs.filter((c) => c.teamName === "Würzburger Kickers");
  assert.ok(wuerzburg.length >= 2, "fixture should contain the duplicate record");
  const ids = new Set(wuerzburg.map((c) => resolveClub(c).clubId));
  assert.equal(ids.size, 1, "the duplicate must resolve to one club identity");
});

test("aliases fold onto one identity rather than a second entry", () => {
  // SV Wehen Wiesbaden and SSV Ulm appear under more than one short name.
  assert.equal(
    resolveClub({ teamId: 1, shortName: "Wiesbaden", teamName: "SV Wehen Wiesbaden" }).clubId,
    resolveClub({ teamId: 1, shortName: "Wehen", teamName: "SV Wehen Wiesbaden" }).clubId,
  );
  assert.equal(
    resolveClub({ teamId: 2, shortName: "SSV Ulm 1846", teamName: "SSV Ulm 1846" }).clubId,
    resolveClub({ teamId: 2, shortName: "Ulm", teamName: "SSV Ulm 1846" }).clubId,
  );
});

test("the ambiguous name pairs stay distinct", () => {
  // §5.2's dangerous case: pooling both divisions puts both clubs of these
  // pairs in the data. A substring or short-name join would silently merge them.
  const byName = new Map(fixture.clubs.map((c) => [c.teamName, c]));
  const pairs = [
    ["FC Bayern München", "TSV 1860 München"],
    ["1. FC Köln", "SC Fortuna Köln"],
    ["Eintracht Frankfurt", "FSV Frankfurt"],
    ["VfB Stuttgart", "Stuttgarter Kickers"],
    ["RB Leipzig", "1. FC Lokomotive Leipzig"],
    ["Borussia Dortmund", "Borussia Mönchengladbach"],
  ];
  let checked = 0;
  for (const [a, b] of pairs) {
    const ca = byName.get(a);
    const cb = byName.get(b);
    if (!ca || !cb) continue; // not both present in this window — nothing to prove
    assert.notEqual(
      resolveClub(ca).clubeloUrlName,
      resolveClub(cb).clubeloUrlName,
      `${a} and ${b} collapsed onto one rating key`,
    );
    checked++;
  }
  // Both Dortmund and Gladbach are in every season of the window, so at least
  // one pair must actually have been exercised.
  assert.ok(checked >= 1, "no ambiguous pair was present to check");
});

test("both clubelo name forms are carried, and they differ where clubelo differs", () => {
  const byName = new Map(fixture.clubs.map((c) => [c.teamName, c]));
  // Verified 2026-07-23: the URL strips spaces, the daily CSV keeps them.
  const expectDiffering = [
    ["1. FC Union Berlin", "UnionBerlin", "Union Berlin"],
    ["RB Leipzig", "RBLeipzig", "RB Leipzig"],
    ["FC St. Pauli", "StPauli", "St Pauli"],
  ];
  for (const [name, url, csv] of expectDiffering) {
    const club = byName.get(name);
    if (!club) continue;
    const r = resolveClub(club);
    assert.equal(r.clubeloUrlName, url, `${name} URL form`);
    assert.equal(r.clubeloCsvName, csv, `${name} CSV form`);
    assert.notEqual(r.clubeloUrlName, r.clubeloCsvName);
  }
});

test("a blank shortName is fixed by teamId rather than guessed", () => {
  // Erzgebirge Aue, teamId 1067, ships with an empty shortName in bl2 2012/13.
  assert.equal(canonicalShortName({ teamId: 1067, shortName: "", teamName: "Erzgebirge Aue" }), "Aue");
  assert.equal(canonicalShortName({ teamId: 1067, shortName: "   ", teamName: "Erzgebirge Aue" }), "Aue");
});

test("an unknown club fails loudly instead of being transliterated", () => {
  assert.throws(
    () => resolveClub({ teamId: 99999, shortName: "Neuling", teamName: "SV Neuling" }),
    ClubResolutionError,
  );
  assert.throws(
    () => resolveClub({ teamId: 99998, shortName: "", teamName: "Ohne Kurznamen" }),
    /no shortName and no override/,
  );
});

test("resolveAll rejects a mapping collision rather than committing it", () => {
  const matches = [
    { team1: { teamId: 1, shortName: "Bayern", teamName: "FC Bayern München" },
      team2: { teamId: 2, shortName: "Dortmund", teamName: "Borussia Dortmund" } },
  ];
  const resolved = resolveAll(matches);
  assert.equal(resolved.size, 2);

  // Two genuinely different clubs pointed at one clubelo history must throw.
  // (Constructed via the alias table: "Wiesbaden" folds onto "Wehen", so a
  // fixture naming both is one club — that must NOT throw.)
  const sameClubTwoNames = [
    { team1: { teamId: 3, shortName: "Wiesbaden", teamName: "SV Wehen Wiesbaden" },
      team2: { teamId: 4, shortName: "Wehen", teamName: "SV Wehen Wiesbaden" } },
  ];
  const folded = resolveAll(sameClubTwoNames);
  assert.equal(folded.size, 1, "one club, not two");
  assert.deepEqual(folded.get("Wehen").openLigaDbIds.sort(), ["3", "4"]);
});
