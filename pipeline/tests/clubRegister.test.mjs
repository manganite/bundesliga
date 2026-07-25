import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadClubRegister, resolveClubName, assertClubsKnown, seasonClubs } from "../src/clubRegister.mjs";

// ============================================================================
//  Club register (§V2b.1 G3) — the completeness gate. The register MUST cover
//  every club that appears in the training window; a gap here would surface as
//  a fail-closed abort during artefact generation, so it is caught up front.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const register = await loadClubRegister(path.join(REPO, "data"));

/** Every distinct club short-name across the 30 committed training files. */
function trainingClubIds() {
  const ids = new Set();
  for (const league of ["bl1", "bl2"]) {
    for (let year = 2011; year <= 2025; year++) {
      const file = path.join(REPO, "data/training/results", `${league}-${year}.json`);
      const { matches } = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const m of matches) { ids.add(m.home); ids.add(m.away); }
    }
  }
  return ids;
}

test("the register covers every club in the 2011/12–2025/26 training window", () => {
  const ids = trainingClubIds();
  const missing = [...ids].filter((id) => !register.clubs[id]);
  assert.deepEqual(missing, [], `register is missing: ${missing.join(", ")}`);
  // And carries no phantom clubs that never appear in the window.
  const phantom = Object.keys(register.clubs).filter((id) => !ids.has(id));
  assert.deepEqual(phantom, [], `register has clubs not in the window: ${phantom.join(", ")}`);
});

test("every entry has a non-empty display name and short name, and cites a source", () => {
  for (const [clubId, entry] of Object.entries(register.clubs)) {
    assert.ok(entry.name && entry.name.length > 0, `${clubId} lacks a name`);
    assert.ok(entry.shortName && entry.shortName.length > 0, `${clubId} lacks a shortName`);
    assert.ok(entry.source && /OpenLigaDB|season files/.test(entry.source), `${clubId} lacks a sourced provenance`);
  }
});

test("names for still-active clubs match the committed season files exactly", () => {
  // No divergence between the register and the season files for overlapping clubs.
  for (const year of [2025, 2026]) {
    for (const league of ["bl1", "bl2"]) {
      const file = path.join(REPO, `data/seasons/${year}/${league}/season.json`);
      if (!fs.existsSync(file)) continue;
      for (const c of JSON.parse(fs.readFileSync(file, "utf8")).clubs) {
        assert.equal(register.clubs[c.clubId]?.name, c.name, `${c.clubId}: register vs season file`);
      }
    }
  }
});

test("resolveClubName is fail-closed — an unknown clubId throws by name", () => {
  assert.equal(resolveClubName(register, "Bayern"), "FC Bayern München");
  assert.throws(() => resolveClubName(register, "Phantom SV"), /unknown clubId "Phantom SV"/);
});

test("assertClubsKnown lists ALL missing clubs at once", () => {
  assert.doesNotThrow(() => assertClubsKnown(register, ["Bayern", "Aue"]));
  assert.throws(
    () => assertClubsKnown(register, ["Bayern", "Nope A", "Nope B"]),
    /2 unknown clubId\(s\): Nope A, Nope B/,
  );
});

test("seasonClubs resolves and sorts a league's clubs", () => {
  const clubs = seasonClubs(register, ["Aue", "Bayern", "Aachen"]);
  assert.deepEqual(clubs.map((c) => c.clubId), ["Aachen", "Aue", "Bayern"]);
  assert.equal(clubs.find((c) => c.clubId === "Aue").name, "Erzgebirge Aue");
});
