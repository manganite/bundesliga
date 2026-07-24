import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  ZAHLENFORMAT — one signed path, no „ Pp." literals off format.js, and the
//  Restprogramm-Schwere card (deviation, no grouped ratings, hidden pre-season).
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const { TabelleUndPrognose } = await harness();

// ---------------------------------------------------------------------------
//  §2 source guard: „ Pp." lives only in format.js.
// ---------------------------------------------------------------------------

test("no „ Pp.“ literal exists outside format.js", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx?$/.test(file)) continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      if (/ Pp\./.test(src)) offenders.push(`${rootRel}/${file}`);
    }
  }
  assert.deepEqual(offenders, [], `„ Pp." must go through format.js; found in: ${offenders.join(", ")}`);
});

test("no page hand-rolls a sign prefix for a percentage-point value", () => {
  // The signed path is pp()/signed(); a `? "+" :` next to a Pp value is the
  // pattern the brief removed.
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx?$/.test(file)) continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (/\?\s*"\+"\s*:/.test(line)) offenders.push(`${rootRel}/${file}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `hand-rolled sign prefixes remain in: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
//  §2 render: uniform real minus for a negative delta.
// ---------------------------------------------------------------------------

const PARAMS = read("data/season-params.json");
const CONFIG = read("data/seasons/2026/config.json");

function tableCtx(season, league, { fixtures } = {}) {
  const seasonData = read(`data/seasons/${season}/${league}/season.json`);
  if (fixtures) seasonData.fixtures = fixtures;
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    season: seasonData,
    outlook: maybe(`data/seasons/${season}/${league}/outlook.json`),
    playoff: maybe(`data/seasons/${season}/playoff.json`),
    leagueConfig: CONFIG.leagues[league],
    league,
    leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    nameOf: (id) => names.get(id) ?? id,
    carried: [],
  };
}

// ---------------------------------------------------------------------------
//  §3 Restprogramm-Schwere.
// ---------------------------------------------------------------------------

test("before the first matchday the Restprogramm card is HIDDEN (§7)", () => {
  const html = strip(renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx: tableCtx(2026, "bl1") })));
  assert.doesNotMatch(html, /Restprogramm-Schwere/,
    "pre-season, every club still has its full double round — the card has nothing to say");
});

test("after a played match the card appears, with the new caption and a deviation column", () => {
  const base = read("data/seasons/2026/bl1/season.json");
  // Play one match: the two clubs involved lose a home (or away) fixture, so
  // their home/away remaining counts diverge → the card becomes informative.
  const fixtures = base.fixtures.map((f, i) => (i === 0 ? { ...f, gh: 2, ga: 1 } : f));
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx: tableCtx(2026, "bl1", { fixtures }) }));
  const text = strip(html);
  assert.match(text, /Restprogramm-Schwere/);
  assert.match(text, /als Abweichung vom Durchschnitt: positiv = schwereres Restprogramm/);
  assert.match(text, /Heim und auswärts getrennt, weil dasselbe Gegner-Rating auswärts schwerer wiegt/);
  assert.match(text, /Abweichung/);
});

test("ratings in the card are not thousands-grouped", () => {
  const base = read("data/seasons/2026/bl1/season.json");
  const fixtures = base.fixtures.map((f, i) => (i === 0 ? { ...f, gh: 2, ga: 1 } : f));
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx: tableCtx(2026, "bl1", { fixtures }) }));
  // Isolate the Restprogramm card and check no „1.678"-style grouped rating.
  const marker = html.indexOf("Restprogramm-Schwere");
  const card = html.slice(marker, marker + 4000);
  assert.doesNotMatch(strip(card), /1\.\d{3}\b/, "an Elo like 1678 must never render as 1.678");
  // A four-digit ungrouped rating IS present.
  assert.match(strip(card), /\b1\d{3}\b/);
});

test("the deviation carries a real minus for a below-average schedule", () => {
  const base = read("data/seasons/2026/bl1/season.json");
  const fixtures = base.fixtures.map((f, i) => (i < 3 ? { ...f, gh: 1, ga: 0 } : f));
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx: tableCtx(2026, "bl1", { fixtures }) }));
  const marker = html.indexOf("Restprogramm-Schwere");
  const card = strip(html.slice(marker, marker + 6000));
  // Some club has a below-average remaining schedule → a „−" deviation.
  assert.match(card, /−\d+/, "a below-average schedule must show a real-minus deviation");
  // And never a hyphen-minus for it.
  assert.doesNotMatch(card, /\s-\d+ \d/, "no ASCII hyphen-minus as a sign");
});
