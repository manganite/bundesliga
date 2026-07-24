import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  UEBERSICHT_HEADER_FOOTER + FARBEN_UNTERTITEL. Presentation only.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const { SiteFooter, Uebersicht, Methodik, FixturePrediction } = await harness();
const PARAMS = read("data/season-params.json");

// ---------------------------------------------------------------------------
//  Subtitle + header (§2.4, §2.6 / B14 §1).
// ---------------------------------------------------------------------------

test("the header subtitle is the decided verbatim wording", () => {
  const app = srcOf("apps/public/src/App.jsx");
  assert.ok(app.includes("Eine Monte-Carlo-Simulation der Bundesliga — rechnet nach jedem Spieltag mit den"));
  assert.ok(app.includes("tatsächlichen Ergebnissen neu. Keine einmalige, starre Prognose."));
});

test("the run-count selector is gone — no simulation controls, no jargon line", () => {
  const app = srcOf("apps/public/src/App.jsx");
  assert.ok(!app.includes("SimulationControls"), "the control component must not be imported");
  assert.ok(!app.includes("aus dem committeten Artefakt"));
  assert.ok(!fs.existsSync(path.join(REPO, "apps/public/src/components/SimulationControls.jsx")));
  assert.ok(!fs.existsSync(path.join(REPO, "apps/public/src/hooks/useSimulation.js")));
});

// ---------------------------------------------------------------------------
//  Footer (§2.3).
// ---------------------------------------------------------------------------

test("the footer has three lines: identity+version, the §0 sentence, sources", () => {
  const html = strip(renderToStaticMarkup(React.createElement(SiteFooter, { version: "2.1.0", buildStamp: "abc1234 · 2026-07-24" })));
  assert.match(html, /Bundesliga-Simulator · v2\.1\.0 · Code GPL-3\.0 · Quellcode/);
  assert.match(html, /Build abc1234 · 2026-07-24/);
  assert.match(html, /Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings/);
  assert.match(html, /OpenLigaDB.*ODbL 1\.0.*clubelo\.com/);
});

test("the parameter provenance is NOT in the footer — it moved to Methodik", () => {
  const footer = srcOf("apps/public/src/components/SiteFooter.jsx");
  assert.ok(!/procedureVersion|fitDate|track-c/.test(footer), "provenance must not live in the footer");
  const methodik = srcOf("apps/public/src/pages/Methodik.jsx");
  assert.ok(/procedureVersion/.test(methodik), "provenance belongs in Methodik step 4");
});

test("Methodik step 4 renders the parameter provenance", () => {
  const config = read("data/seasons/2026/config.json");
  const seasonData = read("data/seasons/2026/bl1/season.json");
  const ctx = {
    season: seasonData, outlook: read("data/seasons/2026/bl1/outlook.json"),
    prematch: read("data/seasons/2026/bl1/prematch.json"), params: PARAMS,
    leagueConfig: config.leagues.bl1, league: "bl1", leagueLabel: "Bundesliga",
    nameOf: (id) => id,
  };
  const html = strip(renderToStaticMarkup(React.createElement(Methodik, { ctx })));
  assert.match(html, /track-c-part0-v1/);
  assert.match(html, /gefittet am 2026-07-22/);
});

// ---------------------------------------------------------------------------
//  Platzierungszonen (§2.1).
// ---------------------------------------------------------------------------

function uebersichtCtx() {
  const config = read("data/seasons/2026/config.json");
  const seasonData = read("data/seasons/2026/bl1/season.json");
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  return {
    season: seasonData, outlook: read("data/seasons/2026/bl1/outlook.json"),
    prematch: read("data/seasons/2026/bl1/prematch.json"), params: PARAMS,
    leagueConfig: config.leagues.bl1, league: "bl1", leagueLabel: "Bundesliga",
    nameOf: (id) => names.get(id) ?? id, phase: "preSeason",
  };
}

test("the Platzierungszonen card drops Meister/Abstieg and keeps the qualification caption", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx() })));
  // Its own heading exists…
  assert.match(html, /Platzierungszonen/);
  assert.match(html, /Platzierungswahrscheinlichkeiten, keine Qualifikationen/);
  // …and inside it, the zones without an own card appear as sub-labels.
  assert.match(html, /Platz 1–4/);
  assert.match(html, /Relegationsplatz/);
});

// ---------------------------------------------------------------------------
//  Colours (§FARBEN §2): tokens only, no per-case hex; consumed at the sites.
// ---------------------------------------------------------------------------

test("no component carries its own outcome/sign/zone hex — tokens only", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx?$/.test(file)) continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      // A hex literal in a JSX/style context is the smell; the tokens live in
      // index.css. (SVG chart fills use var()/theme tokens too.)
      for (const [i, line] of src.split("\n").entries()) {
        if (/#[0-9a-fA-F]{3,6}\b/.test(line)) offenders.push(`${rootRel}/${file}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `hex colours belong in index.css tokens; found: ${offenders.join(", ")}`);
});

test("the outcome colour encodes WHICH outcome, with the label beside it", async () => {
  const PARAMS2 = read("data/season-params.json");
  const { effectiveParams, predictMatch } = await import("../../../packages/engine/src/model.mjs");
  const pred = predictMatch(1720, 1600, effectiveParams(PARAMS2.params, { league: "bl1" }));
  const html = renderToStaticMarkup(React.createElement(FixturePrediction, { prediction: pred, prefix: null }));
  // A home favourite → the label carries the home-outcome token, and the word is present.
  assert.match(html, /var\(--outcome-home\)/);
  assert.match(strip(html), /Heimsieg/);
});

test("Szenarien deltas and fixture impact stay NEUTRAL — a comment says why", () => {
  const impact = srcOf("apps/public/src/components/WichtigstesSpiel.jsx");
  assert.ok(/Deliberately NOT coloured/i.test(impact), "the reason must be recorded at the site");
  assert.ok(!/perfColor|outcomeColor/.test(impact), "impact values must not be coloured");
  const szen = srcOf("apps/public/src/pages/Szenarien.jsx");
  assert.ok(!/perfColor|outcomeColor/.test(szen), "scenario deltas must not be coloured");
});

test("the projected table carries zone stripes and a legend", async () => {
  const { TabelleUndPrognose } = await harness();
  const config = read("data/seasons/2026/config.json");
  const seasonData = read("data/seasons/2026/bl1/season.json");
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, {
    ctx: {
      season: seasonData, outlook: read("data/seasons/2026/bl1/outlook.json"),
      playoff: read("data/seasons/2026/playoff.json"), params: PARAMS,
      leagueConfig: config.leagues.bl1, league: "bl1", leagueLabel: "Bundesliga",
      nameOf: (id) => names.get(id) ?? id, carried: [],
    },
  }));
  assert.match(html, /zone-stripe/);
  assert.match(html, /zone-legend/);
  assert.match(html, /var\(--zone-champion\)/);
});

// ---------------------------------------------------------------------------
//  §2.5 Szenarien: fixed 2 000 runs; Beispielsaison unaffected („von 20 000").
// ---------------------------------------------------------------------------

test("the what-if runs at a fixed 2 000 (B = 20), and the caption names the price", () => {
  const szen = srcOf("apps/public/src/pages/Szenarien.jsx");
  assert.match(szen, /const WHATIF_RUNS = 2000;/);
  assert.match(szen, /const WHATIF_BATCHES = 20;/);
  // No run-count selector on the page.
  assert.ok(!/Simulationsläufe/.test(szen));
  // The price is stated, not hidden.
  assert.match(szen, /kleine Verschiebungen erscheinen dann als/);
});

test("the Beispielsaison still samples from the canonical space — von 20 000", () => {
  const methodik = srcOf("apps/public/src/pages/Methodik.jsx");
  // Its run count comes from the artefact (outlook.runs), not the what-if 2 000.
  assert.match(methodik, /von \{number\(runs, 0\)\}/);
  assert.ok(!/WHATIF_RUNS/.test(methodik), "the exhibit must not borrow the what-if run count");
});
