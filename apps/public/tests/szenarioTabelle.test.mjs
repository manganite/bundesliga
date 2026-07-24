import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import {
  currentTable,
  scenarioSeason,
  expectedShiftIndicator,
} from "../src/lib/season.js";
import { simulateSeason } from "../../../packages/engine/src/simulate.mjs";

// ============================================================================
//  SZENARIO_TABELLE (Brief 17) — the scenario final table with its CRN-honest
//  base, the position-shift indicator, „Anwenden & rechnen", and the one shared
//  LeagueTable behind three consumers.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const PARAMS = read("data/season-params.json");
const CONFIG = read("data/seasons/2026/config.json");
const SEASON = read("data/seasons/2026/bl1/season.json");
const OUTLOOK = read("data/seasons/2026/bl1/outlook.json");
const PREMATCH = read("data/seasons/2026/bl1/prematch.json");
const nameOf = (() => { const m = new Map(SEASON.clubs.map((c) => [c.clubId, c.name])); return (id) => m.get(id) ?? id; })();

const ctxFor = (season = SEASON) => ({
  season,
  outlook: OUTLOOK,
  prematch: PREMATCH,
  params: PARAMS,
  leagueConfig: CONFIG.leagues.bl1,
  config: CONFIG,
  league: "bl1",
  leagueLabel: "Bundesliga",
  nameOf,
  carried: [],
  matchday: 1,
});

// ---------------------------------------------------------------------------
//  §2.1 real columns react to the TRANSFORMED data state (scenarioSeason)
// ---------------------------------------------------------------------------

test("a fixed fixture makes both clubs show a played match with its result", () => {
  const fx = SEASON.fixtures[0];
  const table = currentTable(scenarioSeason(SEASON, { [fx.id]: { kind: "fixed", gh: 3, ga: 0 } }), CONFIG.leagues.bl1);
  const home = table.find((r) => r.clubId === fx.homeClubId);
  const away = table.find((r) => r.clubId === fx.awayClubId);
  assert.equal(home.played, 1);
  assert.equal(home.pts, 3);
  assert.equal(home.gf, 3);
  assert.equal(away.played, 1);
  assert.equal(away.pts, 0);
  assert.equal(away.ga, 3);
});

test("a released fixture drops a played result back out of the real table", () => {
  const fx = SEASON.fixtures[0];
  // Start from a state where fx is played 2:1…
  const played = { ...SEASON, fixtures: SEASON.fixtures.map((f) => (f.id === fx.id ? { ...f, gh: 2, ga: 1 } : f)) };
  assert.equal(currentTable(played, CONFIG.leagues.bl1).find((r) => r.clubId === fx.homeClubId).played, 1);
  // …releasing it removes both goals, so neither club has played it any more.
  const releasedTable = currentTable(scenarioSeason(played, { [fx.id]: { kind: "released" } }), CONFIG.leagues.bl1);
  assert.equal(releasedTable.find((r) => r.clubId === fx.homeClubId).played, 0);
  assert.equal(releasedTable.find((r) => r.clubId === fx.awayClubId).played, 0);
});

test("scenarioSeason without overrides returns the season untouched", () => {
  assert.equal(scenarioSeason(SEASON, {}), SEASON);
  assert.equal(scenarioSeason(SEASON, null), SEASON);
});

// ---------------------------------------------------------------------------
//  §2.2 the position-shift indicator
// ---------------------------------------------------------------------------

test("expectedShiftIndicator ranks by expected points and reports ↑/↓/· with the pts delta", () => {
  const points = { A: { expected: 50 }, B: { expected: 40 }, C: { expected: 30 } };     // order A,B,C
  const base = { A: { expected: 35 }, B: { expected: 45 }, C: { expected: 30 } };        // order B,A,C
  const ind = expectedShiftIndicator(points, base);
  assert.deepEqual(ind.get("A"), { posDelta: 1, ptsDelta: 15 });   // A climbed from 2 to 1
  assert.deepEqual(ind.get("B"), { posDelta: -1, ptsDelta: -5 });  // B fell from 1 to 2
  assert.deepEqual(ind.get("C"), { posDelta: 0, ptsDelta: 0 });    // C unchanged
});

test("expectedShiftIndicator is empty when a base is missing (nothing to compare)", () => {
  assert.equal(expectedShiftIndicator({ A: { expected: 1 } }, null).size, 0);
});

// ---------------------------------------------------------------------------
//  §2.2 the indicator RENDERED — arrow + place number as text, both in title
// ---------------------------------------------------------------------------

const mod = await harness();
const { LeagueTable, ScenarioTable, PresetBar, Spieltage } = mod;

const zoneTargets = CONFIG.leagues.bl1.targets
  ? Object.entries(CONFIG.leagues.bl1.targets).map(([id, t]) => ({ id, label: t.label, from: t.from, to: t.to }))
  : [];

test("the indicator renders the arrow WITH the place count and both numbers in the title", () => {
  const table = currentTable(SEASON, CONFIG.leagues.bl1).slice(0, 3);
  const [a, b, c] = table.map((r) => r.clubId);
  const indicator = new Map([
    [a, { posDelta: 2, ptsDelta: 4.3 }],
    [b, { posDelta: -1, ptsDelta: -2.1 }],
    [c, { posDelta: 0, ptsDelta: 0 }],
  ]);
  const html = renderToStaticMarkup(React.createElement(LeagueTable, { table, nameOf, zoneTargets, indicator }));
  assert.match(html, /↑2/);
  assert.match(html, /↓1/);
  assert.match(html, /·/);
  // The place count is in TEXT, not colour alone; both numbers in the title.
  assert.match(html, /title="2 Plätze auf, \+4,3 erwartete Punkte"/);
  assert.match(html, /title="1 Platz ab, −2,1 erwartete Punkte"/);
});

test("without an indicator prop the LeagueTable has no shift column (Spieltage / default table)", () => {
  const table = currentTable(SEASON, CONFIG.leagues.bl1);
  const html = renderToStaticMarkup(React.createElement(LeagueTable, { table, nameOf, zoneTargets }));
  assert.doesNotMatch(html, /shift-cell/);
});

// ---------------------------------------------------------------------------
//  §2.3 the CRN-honest base: artefact defaults before a run, paired base after
// ---------------------------------------------------------------------------

test("before a run the scenario table shows the standard prognosis, WITHOUT the indicator", () => {
  const html = renderToStaticMarkup(React.createElement(ScenarioTable, {
    ctx: ctxFor(), committed: null, sim: { status: "idle", result: null }, stale: false,
  }));
  assert.match(strip(html), /Noch kein Szenario — Standardprognose/);
  assert.doesNotMatch(html, /shift-cell/);
});

test("after a run the scenario table carries the indicator and the CRN caption", () => {
  // A fake done run: bump one club so the expected-points order changes vs base.
  const clubs = SEASON.clubs.map((c) => c.clubId);
  const basePoints = OUTLOOK.points;
  const points = { ...basePoints, [clubs[clubs.length - 1]]: { ...basePoints[clubs[0]], expected: 999 } };
  const committed = { [SEASON.fixtures[0].id]: { kind: "fixed", gh: 1, ga: 0 } };
  const sim = { status: "done", result: { points, basePoints } };
  const html = renderToStaticMarkup(React.createElement(ScenarioTable, { ctx: ctxFor(), committed, sim, stale: false }));
  assert.match(strip(html), /Vergleich gegen die unveränderte Prognose, gleiche Zufallszahlen/);
  assert.match(html, /shift-cell/);
});

test("a stale scenario table is dimmed together with the tabs", () => {
  const sim = { status: "done", result: { points: OUTLOOK.points, basePoints: OUTLOOK.points } };
  const committed = { [SEASON.fixtures[0].id]: { kind: "fixed", gh: 1, ga: 0 } };
  const fresh = renderToStaticMarkup(React.createElement(ScenarioTable, { ctx: ctxFor(), committed, sim, stale: false }));
  const stale = renderToStaticMarkup(React.createElement(ScenarioTable, { ctx: ctxFor(), committed, sim, stale: true }));
  assert.doesNotMatch(fresh, /is-stale/);
  assert.match(stale, /is-stale/);
});

// ---------------------------------------------------------------------------
//  §1 „Anwenden & rechnen"
// ---------------------------------------------------------------------------

test("the preset button says „Anwenden & rechnen“", () => {
  const html = strip(renderToStaticMarkup(React.createElement(PresetBar, {
    ctx: ctxFor(), matchdays: [1, 2], duelBy: new Map(), modelOf: () => null, overrides: {}, onApply: () => {},
  })));
  assert.match(html, /Anwenden &(?:amp;)? rechnen/);
});

test("„Anwenden & rechnen“ wires the run, and manual edits still do not auto-run", () => {
  const src = fs.readFileSync(path.join(REPO, "apps/public/src/pages/Szenarien.jsx"), "utf8");
  // The preset onApply commits (runs) as well as fills.
  assert.match(src, /onApply=\{\(next, msg\) => \{ setOverrides\(next\); setMessage\(msg\); setCommitted\(next\); \}\}/);
  // A single fixture edit only touches overrides — never setCommitted.
  assert.match(src, /onFix=\{\(gh, ga\) => setOverride/);
  assert.doesNotMatch(src, /onFix=\{[^}]*setCommitted/);
});

// ---------------------------------------------------------------------------
//  §3 one LeagueTable, three consumers
// ---------------------------------------------------------------------------

test("LeagueTable is the one standings implementation, used by all three consumers", () => {
  const consumers = ["pages/TabelleUndPrognose.jsx", "pages/Spieltage.jsx", "pages/Szenarien.jsx"];
  for (const rel of consumers) {
    const src = fs.readFileSync(path.join(REPO, "apps/public/src", rel), "utf8");
    assert.match(src, /import LeagueTable from/, `${rel} must consume the shared LeagueTable`);
  }
  // No page hand-rolls the standings header any more; the „erw. Pkt" column
  // header exists in exactly one place.
  const dirs = ["apps/public/src/pages", "apps/public/src/components"];
  let headerSites = 0;
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(REPO, d))) {
      if (!/\.jsx$/.test(f)) continue;
      if (/>erw\. Pkt</.test(fs.readFileSync(path.join(REPO, d, f), "utf8"))) headerSites++;
    }
  }
  assert.equal(headerSites, 1, "the standings header must live in exactly one component");
});

test("the Spieltage snapshot table now carries Tore, Diff, zone stripes and a legend", () => {
  // A season with a couple of played matchdays so the table has real content.
  const withResults = { ...SEASON, fixtures: SEASON.fixtures.map((f) => (f.matchday <= 2 ? { ...f, gh: 2, ga: 0 } : f)) };
  const html = renderToStaticMarkup(React.createElement(Spieltage, { ctx: { ...ctxFor(withResults), matchday: 2 } }));
  const marker = html.indexOf("Tabelle nach dem");
  const card = html.slice(marker, marker + 6000);
  assert.match(card, />Tore</, "Tore column header present");
  assert.match(card, />Diff</, "Diff column header present");
  assert.match(strip(card), /\d+:\d+/, "goals for:against are shown");
  assert.match(card, /zone-stripe/);
  assert.match(card, /zone-legend/);
});

// ---------------------------------------------------------------------------
//  §4 no new engine numbers — the passed-through points are the artefact's
// ---------------------------------------------------------------------------

test("simulateSeason at the artefact's run count reproduces outlook.points bit-for-bit", () => {
  // The worker passes `modified.points` straight through; at an unchanged data
  // state and the SAME run count, that is identical to the committed artefact.
  // Re-derive it here to prove the numbers are re-used, never recomputed anew.
  const targets = Object.fromEntries(
    Object.entries(CONFIG.leagues.bl1.targets).map(([n, t]) => [n, { places: t.places, positions: (r) => r >= t.from && r <= t.to }]),
  );
  const sim = simulateSeason({
    seasonId: "2026-bl1",
    league: "bl1",
    clubs: SEASON.clubs.map((c) => ({ clubId: c.clubId, rating: OUTLOOK.ratings[c.clubId] })),
    fixtures: SEASON.fixtures.map((f) => ({ id: f.id, home: f.homeClubId, away: f.awayClubId, ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}) })),
    params: PARAMS.params,
    targets,
    runs: OUTLOOK.runs,
    batches: OUTLOOK.batches,
    rules: { pointsForWin: CONFIG.leagues.bl1.pointsForWin, pointsForDraw: CONFIG.leagues.bl1.pointsForDraw, criteria: CONFIG.leagues.bl1.tiebreakCriteria },
  });
  assert.deepEqual(sim.points, OUTLOOK.points);
});
