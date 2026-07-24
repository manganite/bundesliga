import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  ZONEN_LAYOUT_RELEASES — zone counts, column layout, the „Wie gerechnet?" rule.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const { Uebersicht } = await harness();
const PARAMS = read("data/season-params.json");

function uebersichtCtx(league) {
  const config = read("data/seasons/2026/config.json");
  const seasonData = read(`data/seasons/2026/${league}/season.json`);
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  return {
    season: seasonData, outlook: read(`data/seasons/2026/${league}/outlook.json`),
    prematch: read(`data/seasons/2026/${league}/prematch.json`), params: PARAMS,
    leagueConfig: config.leagues[league], league, leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    nameOf: (id) => names.get(id) ?? id, phase: "preSeason",
  };
}

/** Count the candidate rows (prob bars) inside the zone block whose h4 label
 *  matches — robust against the label also appearing in a caption elsewhere. */
function zoneRowCount(html, zoneLabel) {
  // Each zone block is a <div class="zone-block"> … up to the next one.
  const segments = html.split('class="zone-block"').slice(1);
  for (const seg of segments) {
    // The label lives in the block's <h4 class="zone-label"> … {label} </h4>.
    const h4 = seg.slice(0, seg.indexOf("</h4>"));
    if (h4.includes(zoneLabel)) return (seg.match(/class="prob-bar"/g) ?? []).length;
  }
  return -1;
}

// ---------------------------------------------------------------------------
//  §1 zone counts = max(places, 3).
// ---------------------------------------------------------------------------

test("BL1: Platz 1–4 shows four candidates, Platz 5–6 and Relegationsplatz three", () => {
  const html = renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx("bl1") }));
  assert.equal(zoneRowCount(html, "Platz 1–4"), 4, "a four-place zone must show four");
  assert.equal(zoneRowCount(html, "Platz 5–6"), 3, "a two-place zone still shows three");
  assert.equal(zoneRowCount(html, "Relegationsplatz"), 3);
});

test("BL2: the count follows the config automatically (Aufstieg is the title card, not here)", () => {
  const html = renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx("bl2") }));
  // BL2 zones without an own card: Relegationsplatz (3.) and Relegationsplatz (16.), each one place → three.
  assert.match(strip(html), /Platzierungszonen/);
  assert.equal(zoneRowCount(html, "Relegationsplatz (3.)"), 3);
});

test("the count is derived from the config, not hard-coded", () => {
  assert.match(srcOf("apps/public/src/pages/Uebersicht.jsx"), /Math\.max\(t\.places, 3\)/);
});

// ---------------------------------------------------------------------------
//  §2 column layout, defined reading order.
// ---------------------------------------------------------------------------

test("the Übersicht uses a column layout, not a row grid", () => {
  const html = renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx("bl1") }));
  assert.match(html, /class="card-columns"/);
  assert.doesNotMatch(html, /class="card-grid"/);
  assert.match(srcOf("apps/public/src/index.css"), /\.card-columns\s*\{[^}]*columns:/);
});

test("the reading order is Titelrennen → Wichtigstes → Abstieg → Spannung → Zonen", () => {
  const t = strip(renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx("bl1") })));
  const order = ["Titelrennen", "Wichtigstes kommendes Spiel", "Abstiegskampf", "Spannungsindex", "Platzierungszonen"];
  const positions = order.map((label) => t.indexOf(label));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1] && positions[i - 1] >= 0, `${order[i]} must follow ${order[i - 1]}`);
  }
});

// ---------------------------------------------------------------------------
//  §3 „Wie gerechnet?" is a shared component and a rule.
// ---------------------------------------------------------------------------

test("only Disclosure.jsx writes the raw <details> — one component, not copies", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (file === "Disclosure.jsx" || !/\.jsx$/.test(file)) continue;
      if (/method-disclosure|<details/.test(fs.readFileSync(path.join(REPO, rootRel, file), "utf8"))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `a second disclosure implementation lives in: ${offenders.join(", ")}`);
});

test("the six cards carry a „Wie gerechnet?“ disclosure and keep their anchored wordings", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Uebersicht, { ctx: uebersichtCtx("bl1") })));
  // Spannungsindex: the floor explanation is preserved (now behind the toggle).
  assert.match(html, /Wie gerechnet\?/);
  assert.match(html, /exp\(H\)/);
  assert.match(html, /auf Summe 1 normalisiert/);
});

test("the Card component renders a method disclosure only when method is passed", () => {
  const ui = srcOf("apps/public/src/components/ui.jsx");
  assert.match(ui, /method \? <Disclosure>\{method\}<\/Disclosure> : null/);
});
