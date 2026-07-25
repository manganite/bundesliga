import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { duels, historicalDuels, duelTargetsForCtx } from "../src/lib/season.js";

// ============================================================================
//  ARCHIV_DUELLE — the preset area rule and the historical duels derived from
//  the frozen timeline. One implementation (engine `directDuels`), two data
//  sources (live outlook / archive timeline).
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { PresetBar, Spieltage, TabelleUndPrognose, Szenarien } = await harness();

function ctxFor(year, league, isArchive = true, overrideSeason = null) {
  const config = read(`data/seasons/${year}/config.json`);
  const season = overrideSeason ?? read(`data/seasons/${year}/${league}/season.json`);
  const names = new Map(season.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    seasonId: year, league, leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    leagueConfig: config.leagues[league], config, season,
    outlook: maybe(`data/seasons/${year}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${year}/${league}/timeline-frozen.json`),
    timelineLive: null,
    prematch: maybe(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
    relegation: read("data/relegation.json"),
    playoff: null,
    clubs: names, nameOf: (id) => names.get(id) ?? id,
    matchday: isArchive ? 34 : 1, phase: isArchive ? "finished" : "preSeason", carried: [], isArchive,
  };
}

// ---------------------------------------------------------------------------
//  §2.1 the derivation is equivalent to the live path on the same input
// ---------------------------------------------------------------------------

test("§2.1: on the SAME input, historicalDuels equals the live duels() output", () => {
  const config = { targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } } };
  const probs = { meister: { A: 0.5, B: 0.5, C: 0.2, D: 0.15, E: 0.05 } };
  const fx = (extra) => [
    { id: "m1", matchday: 1, homeClubId: "A", awayClubId: "B", ...extra("A", "B") },
    { id: "m2", matchday: 1, homeClubId: "C", awayClubId: "D", ...extra("C", "D") },
    { id: "m3", matchday: 1, homeClubId: "E", awayClubId: "A", ...extra("E", "A") },
  ];
  // Live: matchday-1 fixtures OPEN, probabilities from the outlook.
  const liveSeason = { fixtures: fx(() => ({})), clubs: [] };
  const live = duels(liveSeason, { probabilities: probs }, config);
  // Archive: the SAME fixtures PLAYED, probabilities from timeline point 0.
  const archiveSeason = { fixtures: fx(() => ({ gh: 1, ga: 0 })), clubs: [] };
  const timeline = { points: [{ matchday: 0, probabilities: probs }] };
  const archive = historicalDuels(archiveSeason, timeline, config);

  const key = (d) => `${d.fixtureId}|${d.target}|${d.pHome}|${d.pAway}`;
  assert.deepEqual(archive.map(key).sort(), live.map(key).sort(), "same input → same duels");
  // A-B (0.5/0.5) and C-D (0.2/0.15) qualify; E-A (0.05/0.5) does not (E < θ).
  assert.deepEqual(new Set(archive.map((d) => d.fixtureId)), new Set(["m1", "m2"]));
});

// ---------------------------------------------------------------------------
//  §1 the preset area rule in three states
// ---------------------------------------------------------------------------

function presetHtml(ctx) {
  return strip(renderToStaticMarkup(React.createElement(PresetBar, {
    ctx, matchdays: [1, 34], duelBy: duelTargetsForCtx(ctx), modelOf: () => null, overrides: {}, onApply: () => {},
  })));
}

test("§1: an archive season offers exactly „Alle Spiele“ — not offene/gespielte", () => {
  const html = presetHtml(ctxFor(2015, "bl1", true));
  assert.match(html, /Alle Spiele/);
  assert.doesNotMatch(html, /Alle offenen Spiele/);
  assert.doesNotMatch(html, /Alle gespielten Spiele/);
});

test("§1: the pre-season offers no „gespielte“ area (nothing is played yet)", () => {
  const html = presetHtml(ctxFor(2026, "bl1", false));
  assert.match(html, /Alle offenen Spiele/);
  assert.doesNotMatch(html, /Alle gespielten Spiele/);
  assert.doesNotMatch(html, /Alle Spiele</);
});

test("§1: a mid-season offers both open and played areas", () => {
  const base = read("data/seasons/2015/bl1/season.json");
  // Half the matchdays open, half played.
  const mid = { ...base, fixtures: base.fixtures.map((f) => (f.matchday > 17 ? { ...f, gh: undefined, ga: undefined } : f)) };
  const html = presetHtml(ctxFor(2015, "bl1", false, mid));
  assert.match(html, /Alle offenen Spiele/);
  assert.match(html, /Alle gespielten Spiele/);
});

// ---------------------------------------------------------------------------
//  §2.2 the duels appear in the archive at all three places
// ---------------------------------------------------------------------------

test("§2.2: Szenarien offers the „Direkte Duelle“ area and marks a duel row in the archive", () => {
  const html = renderToStaticMarkup(React.createElement(Szenarien, { ctx: ctxFor(2015, "bl1", true) }));
  assert.match(html, /Direkte Duelle/, "the duels area is offered again");
  assert.match(html, /duel-row/, "a duel of the shown matchday is marked");
});

test("§2.2: Spieltage marks the duels of the displayed matchday in the archive", () => {
  const html = renderToStaticMarkup(React.createElement(Spieltage, { ctx: ctxFor(2015, "bl1", true) }));
  assert.match(html, /duel-row/);
});

test("§2.2: the Duelle card renders the season's duels in tabs in the archive", () => {
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx: ctxFor(2015, "bl1", true) }));
  const text = strip(html);
  assert.match(text, /Direkte Duelle/);
  assert.match(html, /role="tablist"/, "the shared target tabs render");
});

// ---------------------------------------------------------------------------
//  §2.3 the archive caption is anchored; the live caption is unchanged
// ---------------------------------------------------------------------------

test("§2.3: the archive duel caption is anchored, the live one stays for a live season", () => {
  const archive = strip(renderToStaticMarkup(React.createElement(Spieltage, { ctx: ctxFor(2015, "bl1", true) })));
  assert.match(archive, /nach der retrospektiven Modellrechnung mit den heutigen Parametern, nicht nach damaliger Einschätzung/);

  const live = strip(renderToStaticMarkup(React.createElement(Spieltage, { ctx: ctxFor(2026, "bl1", false) })));
  assert.match(live, /Hervorgehoben: direkte Duelle \(beide Klubs ≥ 10 % auf dasselbe Ziel\)/);
  assert.doesNotMatch(live, /retrospektiven Modellrechnung/);
});
