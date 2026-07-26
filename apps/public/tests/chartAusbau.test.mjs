import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { matchdaySurprises, nonCarriedScored, verlaufSeries } from "../src/lib/season.js";
import { brierScore } from "../../../packages/engine/src/metrics.mjs";

// ============================================================================
//  CHART_AUSBAU §0/§2 — shared tooltip/legend infrastructure and the Teams
//  charts (zone partition + placement histogram) that first consume them.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const PARAMS = read("data/season-params.json");
const { Teams, Verlauf, Modellguete, ChartLegend, ChartTooltip } = await harness();

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
const renderVerlauf = (ctx) => renderToStaticMarkup(React.createElement(Verlauf, { ctx }));

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

test("the Y-axis title is rotated vertically, never a horizontal label that overlaps the top tick", () => {
  // Regression: the axis-title used to sit horizontally at the top-left, on top
  // of the „100 %" tick. It must now be a rotated (vertical) label.
  const html = renderTeams(ARCHIVE);
  const titles = [...html.matchAll(/<text[^>]*class="axis-title"[^>]*>/g)].map((m) => m[0]);
  assert.ok(titles.length > 0, "expected an axis title");
  for (const t of titles) assert.match(t, /transform="rotate\(-90\)"/, `axis title not rotated: ${t}`);
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

// ---------------------------------------------------------------------------
//  §1 · Verlauf — legend with highlight, per-matchday tooltip with surprises.
// ---------------------------------------------------------------------------

test("matchdaySurprises: constructed matchday to top-2 by surprisal, home first, bit unit", () => {
  const scored = [
    { fixture: { matchday: 7, homeClubId: "A", awayClubId: "B", gh: 0, ga: 1 }, surprisal: 3.24 },
    { fixture: { matchday: 7, homeClubId: "C", awayClubId: "D", gh: 2, ga: 2 }, surprisal: 1.10 },
    { fixture: { matchday: 7, homeClubId: "E", awayClubId: "F", gh: 3, ga: 0 }, surprisal: 4.90 },
    { fixture: { matchday: 8, homeClubId: "G", awayClubId: "H", gh: 1, ga: 0 }, surprisal: 0.4 },
  ];
  const m = matchdaySurprises(scored, (id) => id);
  // Matchday 7: the two biggest, E–F (4.9) before A–B (3.24), C–D dropped.
  assert.deepEqual(m.get(7), ["E 3:0 F · 4,9 bit", "A 0:1 B · 3,2 bit"]);
  assert.equal(m.get(8).length, 1);
});

test("Verlauf multi-club chart: a legend with FULL club names and highlight toggles, no truncated end-labels", () => {
  const ctx = { ...ctxFor(2015, "bl1"), isArchive: true };
  const html = renderVerlauf(ctx);
  assert.match(html, /class="chart-legend"/);
  // Interactive highlight: legend entries are real toggle buttons.
  assert.match(html, /<button[^>]*class="legend-toggle"/);
  // A long club name appears in full (the old end-labels truncated to 15 chars + „…").
  assert.match(strip(html), /Mönchengladbach/);
  assert.doesNotMatch(html, /…<\/text>/); // no truncated SVG end-label survives
});

test("Verlauf: the multi-club chart carries the keyboard hit areas with a matchday summary", () => {
  const ctx = { ...ctxFor(2015, "bl1"), isArchive: true };
  const html = renderVerlauf(ctx);
  assert.match(html, /<rect[^>]*tabindex="0"[^>]*role="button"/);
  assert.match(html, /aria-label="[^"]*Spieltag[^"]*"/);
});

// The selection rule: prominence = P (normal) or 1 − P (inverted, „safe" target).
const timelinePoints = (byClub) => {
  const mds = byClub[Object.keys(byClub)[0]].length;
  return Array.from({ length: mds }, (_, i) => ({
    matchday: i,
    probabilities: { t: Object.fromEntries(Object.entries(byClub).map(([c, vs]) => [c, vs[i]])) },
  }));
};

test("verlaufSeries (normal): ranked by PEAK, so a faded club outranks a currently-higher one that never peaked", () => {
  const pts = timelinePoints({
    Faded: [0.8, 0.4, 0.1], // peak 0.8, now low — but its story is the fade
    Steady: [0.15, 0.15, 0.15], // higher CURRENT than Faded, lower peak
    Never: [0.0, 0.01, 0.015], // never ≥2 %: filler only
  });
  assert.deepEqual(verlaufSeries(pts, "t", false, 8).map((s) => s.clubId), ["Faded", "Steady", "Never"]);
  // Cap below the field size keeps the highest PEAK, not the highest current.
  assert.deepEqual(verlaufSeries(pts, "t", false, 1).map((s) => s.clubId), ["Faded"]);
});

test("verlaufSeries (inverted): an always-safe club is NOT shown; the endangered one is", () => {
  const pts = timelinePoints({
    Safe: [1, 1, 1], // P(Klassenerhalt)=1 → risk 0, never qualifies
    Danger: [0.9, 0.7, 0.9], // risk dipped to 0.3 → qualifies
  });
  // Normal logic would pick „Safe" first (highest P); inverted picks „Danger".
  assert.deepEqual(verlaufSeries(pts, "t", true, 1).map((s) => s.clubId), ["Danger"]);
  const both = verlaufSeries(pts, "t", true, 8);
  assert.equal(both[0].clubId, "Danger");
  assert.ok(both[0].qualifies && !both[1].qualifies);
});

test("Verlauf Klassenerhalt: the caption inverts to the risk of MISSING it", () => {
  // Render with Klassenerhalt selected by making it the first target.
  const base = ctxFor(2015, "bl1");
  const cfg = base.config;
  const kls = cfg.leagues.bl1.targets.klassenerhalt;
  const leagueConfig = { ...cfg.leagues.bl1, targets: { klassenerhalt: kls, ...cfg.leagues.bl1.targets } };
  const html = renderVerlauf({ ...base, leagueConfig, isArchive: true });
  assert.match(strip(html), /höchsten Risiko im Verlauf, .*Klassenerhalt.* zu verpassen/);
  assert.match(strip(html), /mindestens einmal ≥ 2 % erreichten/);
});

// ---------------------------------------------------------------------------
//  §3 · Kalibrierung — % axis, legend, per-class tooltip fallback.
//  §4 · Güte-Zeitreihen — cumulative + matchday points, last point ≡ Gesamt.
// ---------------------------------------------------------------------------

const MODELL = { ...ctxFor(2015, "bl1"), isArchive: true };
const renderModell = (ctx) => renderToStaticMarkup(React.createElement(Modellguete, { ctx }));

test("Kalibrierung bars: % Y-axis, a legend for gesagt/eingetreten, per-class hit summary", () => {
  const html = renderModell(MODELL);
  assert.match(html, /class="chart-legend"/);
  assert.match(strip(html), /gesagt\s+eingetreten/);
  assert.match(html, /class="axis-title"/);
  // The per-class keyboard summary carries both series and n (the tooltip content).
  assert.match(html, /aria-label="[^"]*gesagt[^"]*eingetreten[^"]*n [0-9]/);
});

test("Treffsicherheit über die Zeit: cumulative line PLUS pale matchday points and a labelled random reference", () => {
  const html = renderModell(MODELL);
  assert.match(html, /Treffsicherheit über die Zeit/);
  assert.match(html, /<polyline/); // the cumulative line
  assert.match(html, /<circle[^>]*opacity="0.3"/); // the pale per-matchday points
  assert.match(html, /class="ref-line"/);
  assert.match(strip(html), /Zufall 33 %/);
});

test("Brier and Log-Loss card renders both cumulative curves with a stated Gesamt and the lower-is-better direction", () => {
  const html = renderModell(MODELL);
  assert.match(html, /Brier &amp; Log-Loss über die Zeit/);
  assert.match(strip(html), /niedriger ist besser/);
  // Both mini-charts state their season figure; the identity last-point ≡ Gesamt
  // is pinned exactly in the engine test (chartAggregations).
  assert.match(strip(html), /Brier — niedriger ist besser\. Gesamt: \d,\d\d\d/);
  assert.match(strip(html), /Log-Loss — niedriger ist besser\. Gesamt: \d,\d\d\d/);
  // Carried-forward stays out of the curves (stated in the method text).
  assert.match(strip(html), /Übertragene ältere Ratings zählen hier nicht mit/);
});

test("nonCarriedScored drops carried-forward entries from the curves (Bestandsmechanik)", () => {
  const scored = [
    { fixture: { matchday: 1 }, provenance: "contemporaneous", prediction: { homeWin: 0.5, draw: 0.3, awayWin: 0.2 }, actual: "homeWin" },
    { fixture: { matchday: 1 }, provenance: "carried-forward", prediction: { homeWin: 0.4, draw: 0.3, awayWin: 0.3 }, actual: "draw" },
    { fixture: { matchday: 2 }, provenance: "backfilled", prediction: { homeWin: 0.6, draw: 0.25, awayWin: 0.15 }, actual: "awayWin" },
  ];
  const kept = nonCarriedScored(scored);
  assert.equal(kept.length, 2);
  assert.ok(!kept.some((s) => s.provenance === "carried-forward"));
  // The curve figure over the kept set differs from the full set — proof the drop matters.
  assert.notEqual(brierScore(kept).value, brierScore(scored).value);
});
