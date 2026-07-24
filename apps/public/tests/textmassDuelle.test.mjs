import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { duels } from "../src/lib/season.js";

// ============================================================================
//  TEXTMASS_DUELLE — text measure token + shared duel tabs. Presentation only.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const { DirekteDuelle, Card } = await harness();

// ---------------------------------------------------------------------------
//  §1 Text measure: one token, cards follow text.
// ---------------------------------------------------------------------------

test("the measure token exists and is the single source of body-text width", () => {
  const css = srcOf("apps/public/src/index.css");
  assert.match(css, /--measure-text:\s*88ch/);
  // Every flowing-text rule uses the token; none carries its own ch/px measure.
  const bodyTextSelectors = [".page-intro", ".card .caption", "figure.chart figcaption", ".methodik-step"];
  for (const sel of bodyTextSelectors) {
    const block = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    assert.match(block, /max-width:\s*var\(--measure-text\)/, `${sel} must use the measure token`);
  }
});

test("no body-text element declares its own max-width in a component or page", () => {
  // A source scan, same spirit as the league-name guard: flowing text may not
  // carry a per-case max-width (inline style or a ch value).
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    const dir = path.join(REPO, rootRel);
    for (const file of fs.readdirSync(dir)) {
      if (!/\.jsx?$/.test(file)) continue;
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (/maxWidth\s*:/.test(line) || /max-width\s*:\s*\d+ch/.test(line)) offenders.push(`${file}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `body text carries its own max-width in: ${offenders.join(", ")}`);
});

test("a pure-text card shrinks to the measure; a table card keeps full width", () => {
  const textCard = renderToStaticMarkup(React.createElement(Card, { title: "T", textOnly: true }, React.createElement("p", null, "nur Text")));
  const tableCard = renderToStaticMarkup(React.createElement(Card, { title: "T" }, React.createElement("table", null)));
  // The proxy for width: the text-only card carries the class that applies the
  // measure; the table card does not. (jsdom does no CSS layout.)
  assert.match(textCard, /class="card text-only"/);
  assert.match(tableCard, /class="card"/);
  assert.doesNotMatch(tableCard, /text-only/);
  // And the CSS rule that shrinks it exists.
  assert.match(srcOf("apps/public/src/index.css"), /\.card\.text-only\s*\{\s*max-width:\s*calc\(var\(--measure-text\)/);
});

// ---------------------------------------------------------------------------
//  §2 Direkte Duelle: shared tab component, tabs per target.
// ---------------------------------------------------------------------------

const SEASON = read("data/seasons/2026/bl1/season.json");
const OUTLOOK = read("data/seasons/2026/bl1/outlook.json");
const CONFIG = read("data/seasons/2026/config.json");
const nameOf = (() => { const m = new Map(SEASON.clubs.map((c) => [c.clubId, c.name])); return (id) => m.get(id) ?? id; })();
const duelList = duels(SEASON, OUTLOOK, CONFIG.leagues.bl1);

const renderDuelle = (list = duelList) =>
  renderToStaticMarkup(React.createElement(DirekteDuelle, { duelList: list, leagueConfig: CONFIG.leagues.bl1, nameOf }));

test("the duel tabs use the shared Tabs component — one implementation, not two", () => {
  // Both consumers import the same component; only Tabs.jsx writes the roles.
  assert.match(srcOf("apps/public/src/components/DirekteDuelle.jsx"), /import Tabs from "\.\/Tabs\.jsx"/);
  assert.match(srcOf("apps/public/src/pages/Szenarien.jsx"), /import Tabs from "\.\.\/components\/Tabs\.jsx"/);
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (file === "Tabs.jsx" || !/\.jsx$/.test(file)) continue;
      if (/role="tablist"/.test(fs.readFileSync(path.join(REPO, rootRel, file), "utf8"))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `a second tab implementation lives in: ${offenders.join(", ")}`);
});

test("one tab per target that has a duel, in config order, with a count label", () => {
  const html = strip(renderDuelle());
  // 2026 pre-season has duels for platz1bis4, platz5bis6, abstieg, relegationsplatz, meister.
  assert.match(html, /Platz 1–4 \(\d+\)/);
  assert.match(html, /Abstieg \(\d+\)/);
  // Klassenerhalt is excluded by the θ/places rule → no such tab.
  assert.doesNotMatch(html, /Klassenerhalt \(/);
});

test("the default tab holds the single most brisant duel (largest min P)", () => {
  const html = renderDuelle();
  // The hottest duel overall is in platz1bis4 (Bayern–Dortmund), so that tab is active.
  const hottest = duelList.slice().sort((a, b) => b.heat - a.heat)[0];
  assert.match(html, new RegExp(`id="duelle-tab-${hottest.target}"[^>]*aria-selected="true"`));
});

test("rows carry the matchday and club-tied values, not a bare pair of percentages", () => {
  const html = renderDuelle();
  const panelStart = html.indexOf('role="tabpanel"');
  const panel = strip(html.slice(panelStart));
  assert.match(panel, /\d+\. Spieltag/);
  // A club-tied value like „Bayern 62,2 % · Dortmund …" (short name = clubId).
  assert.match(panel, /Bayern \d+/);
  // The old „vorher / im Szenario" style bare „P / P" pairing is gone: values
  // are labelled with their club.
  assert.doesNotMatch(strip(renderDuelle()), /Ziel Anteil/);
});

test("within a tab, duels sort by min(P) descending then matchday ascending", () => {
  // Build a controlled duel list for one target with a deliberate tie in heat.
  const list = [
    { fixtureId: "x", target: "meister", home: "A", away: "B", pHome: 0.5, pAway: 0.5, heat: 0.5, matchday: 20 },
    { fixtureId: "y", target: "meister", home: "C", away: "D", pHome: 0.9, pAway: 0.3, heat: 0.3, matchday: 10 },
    { fixtureId: "z", target: "meister", home: "E", away: "F", pHome: 0.5, pAway: 0.5, heat: 0.5, matchday: 12 },
  ];
  const cfg = { ...CONFIG.leagues.bl1, targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } } };
  const html = renderToStaticMarkup(React.createElement(DirekteDuelle, { duelList: list, leagueConfig: cfg, nameOf: (id) => id }));
  const order = [...strip(html).matchAll(/(\d+)\. Spieltag/g)].map((m) => Number(m[1]));
  // heat 0.5 (md 12 then 20) before heat 0.3 (md 10): [12, 20, 10].
  assert.deepEqual(order, [12, 20, 10]);
});

test("no duels league-wide: the card hides (§7)", () => {
  assert.equal(renderDuelle([]), "");
});
