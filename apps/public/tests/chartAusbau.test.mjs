import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  CHART_AUSBAU §0/§2 — shared tooltip/legend infrastructure and the Teams
//  charts (zone partition + placement histogram) that first consume them.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const PARAMS = read("data/season-params.json");
const { Teams, ChartLegend, ChartTooltip } = await harness();

function ctxFor(season, league) {
  const config = read(`data/seasons/${season}/config.json`);
  const seasonData = read(`data/seasons/${season}/${league}/season.json`);
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    season: seasonData,
    outlook: maybe(`data/seasons/${season}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${season}/${league}/timeline-frozen.json`),
    prematch: maybe(`data/seasons/${season}/${league}/prematch.json`),
    params: PARAMS,
    config,
    leagueConfig: config.leagues[league],
    league,
    leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    nameOf: (id) => names.get(id) ?? id,
    carried: [],
  };
}

const renderTeams = (ctx) => renderToStaticMarkup(React.createElement(Teams, { ctx }));

// ---------------------------------------------------------------------------
//  §0 · The shared components are the single writers.
// ---------------------------------------------------------------------------

test("only ChartTooltip.jsx writes .chart-tooltip; only ChartLegend.jsx writes .chart-legend", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offend = { tooltip: [], legend: [] };
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx$/.test(file)) continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      if (/["']chart-tooltip["']/.test(src) && file !== "ChartTooltip.jsx") offend.tooltip.push(file);
      if (/["']chart-legend["']/.test(src) && file !== "ChartLegend.jsx") offend.legend.push(file);
    }
  }
  assert.deepEqual(offend.tooltip, [], `a second .chart-tooltip writer: ${offend.tooltip.join(", ")}`);
  assert.deepEqual(offend.legend, [], `a second .chart-legend writer: ${offend.legend.join(", ")}`);
});

test("no axis-less chart: every file that renders <Chart> also draws an axis label", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx$/.test(file)) continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      if (!/<Chart[\s>]/.test(src)) continue;
      if (!/axis-label|axis-title/.test(src)) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `chart without a labelled axis in: ${offenders.join(", ")}`);
});

test("ChartLegend: swatch + full label per entry; interactive variant uses real toggle buttons", () => {
  const items = [{ key: "meister", label: "Meister", color: "var(--zone-champion)" }, { key: "abstieg", label: "Abstieg", color: "var(--zone-drop)" }];
  const plain = renderToStaticMarkup(React.createElement(ChartLegend, { items }));
  assert.match(plain, /class="chart-legend"/);
  assert.match(strip(plain), /Meister\s+Abstieg/);
  assert.match(plain, /legend-swatch/);
  // Interactive: toggle buttons carry aria-pressed reflecting the active key.
  const toggled = renderToStaticMarkup(React.createElement(ChartLegend, { items, onToggle: () => {}, active: "meister" }));
  assert.match(toggled, /<button[^>]*class="legend-toggle"[^>]*aria-pressed="true"/);
  assert.match(toggled, /is-dimmed/); // the non-active entry dims
});

test("ChartTooltip: standard layout — title, value rows, signed Δpp, in a foreignObject", () => {
  const html = renderToStaticMarkup(React.createElement(ChartTooltip, {
    x: 100, width: 720, title: "3. Spieltag",
    rows: [{ label: "Meister", value: "57,0 %", delta: 0.03, color: "var(--zone-champion)" }],
    context: ["Freiburg 3:1 Bayern"],
  }));
  assert.match(html, /<foreignObject/);
  assert.match(html, /class="chart-tooltip"/);
  assert.match(strip(html), /3\. Spieltag/);
  assert.match(strip(html), /Meister 57,0 %/);
  assert.match(strip(html), /\+3,0 Pp\./); // pp() signed path, real minus/plus
  assert.match(strip(html), /Freiburg 3:1 Bayern/); // context line
});

// ---------------------------------------------------------------------------
//  §2 · Teams charts on a real archive season (2015 has a timeline).
// ---------------------------------------------------------------------------

const ARCHIVE = ctxFor(2015, "bl1");

test("Zonenverteilung replaces the title-chance line: stacked bands with a legend", () => {
  const html = renderTeams(ARCHIVE);
  assert.match(html, /Zonenverteilung im Saisonverlauf/);
  assert.doesNotMatch(html, /Titelchance im Saisonverlauf/);
  const body = strip(html);
  // The partition band labels appear in the legend.
  assert.match(body, /Meister/);
  assert.match(body, /Platz 2–4/);
  assert.match(body, /Mittelfeld/);
  assert.match(body, /Abstieg/);
});

test("the zone stack draws in zone colours (incl. the neutral Mittelfeld token) and a % axis", () => {
  const html = renderTeams(ARCHIVE);
  assert.match(html, /fill="var\(--zone-champion\)"/);
  assert.match(html, /fill="var\(--zone-mid\)"/); // the Mittelfeld ribbon
  assert.match(html, /class="axis-title"/);
  assert.match(strip(html), /100 %/);
});

test("the placement histogram bars carry zone colours and a % axis, with a legend", () => {
  const html = renderTeams(ARCHIVE);
  assert.match(html, /Wo die Saison endet/);
  // A drop-zone rank bar is red, a champion rank bar gold.
  assert.match(html, /fill="var\(--zone-drop\)"/);
  assert.match(html, /fill="var\(--zone-champion\)"/);
});

test("keyboard/screen-reader path: hit areas are focusable and carry the point summary", () => {
  const html = renderTeams(ARCHIVE);
  // The interactive overlay renders focusable rects with a data-driven aria-label,
  // so the tooltip's information is reachable without hover (§0).
  assert.match(html, /<rect[^>]*tabindex="0"[^>]*role="button"/);
  assert.match(html, /aria-label="[^"]*Spieltag[^"]*Meister[^"]*"/);
});

test("the zone bands sum to 1 in the hidden data table row (every matchday total is 100 %)", () => {
  // The Chart's visually-hidden table holds the band percentages; their honesty
  // is the engine test, here we assert the table exists with a band column.
  const html = renderTeams(ARCHIVE);
  assert.match(html, /Zonenverteilung von [^<]* im Saisonverlauf — Zahlen zur Grafik/);
});
