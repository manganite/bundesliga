import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  SZENARIEN_TABS_TEXTE — result-table tabs + verbatim text revisions.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const nameOf = (id) => ({ a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" }[id] ?? id);

const { WhatIfResult, ResultTabs, Szenarien, Methodik } = await harness();

// A result with movers across two targets, one clearly the largest.
const targets = [
  { id: "meister", label: "Meister" },
  { id: "abstieg", label: "Abstieg" },
];
const sim = {
  status: "done",
  result: {
    deltas: {
      meister: {
        a: { baseline: 0.6, modified: 0.452, delta: -0.148, se: 0.01, floor: 0.02, significant: true },
        b: { baseline: 0.2, modified: 0.28, delta: 0.08, se: 0.01, floor: 0.02, significant: true },
      },
      abstieg: {
        c: { baseline: 0.3, modified: 0.35, delta: 0.05, se: 0.01, floor: 0.02, significant: true },
        d: { baseline: 0.1, modified: 0.09, delta: -0.01, se: 0.01, floor: 0.02, significant: false },
      },
    },
  },
};

test("one tab per target with a supra-noise change; targets with none get no tab", () => {
  const html = strip(renderToStaticMarkup(React.createElement(WhatIfResult, { sim, targets, nameOf, runs: 20000, stale: false })));
  assert.match(html, /Meister \(2 · −14,8 Pp\.\)/);
  assert.match(html, /Abstieg \(1 · \+5,0 Pp\.\)/);
});

test("the default tab holds the single largest |Δ| — headline effect without a click", () => {
  // The largest |Δ| is Meister/a (−14,8), so the Meister panel must be the one
  // rendered, showing club Alpha's row.
  const html = renderToStaticMarkup(React.createElement(WhatIfResult, { sim, targets, nameOf, runs: 20000, stale: false }));
  // The active tab is Meister.
  assert.match(html, /id="whatif-tab-meister"[^>]*aria-selected="true"/);
  assert.match(html, /id="whatif-tab-abstieg"[^>]*aria-selected="false"/);
  // The visible panel is Meister's, so Alpha (Meister mover) is in the table.
  const panel = html.slice(html.indexOf('id="whatif-panel-meister"'));
  assert.match(strip(panel), /Alpha/);
});

test("proper tablist / tab / tabpanel roles and wiring", () => {
  const html = renderToStaticMarkup(React.createElement(ResultTabs, {
    tabs: [
      { id: "meister", label: "Meister", rows: [{ clubId: "a", baseline: 0.6, modified: 0.45, delta: -0.15 }], top: { delta: -0.15 } },
    ],
    nameOf,
  }));
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /id="whatif-tab-meister"/);
  assert.match(html, /aria-controls="whatif-panel-meister"/);
  assert.match(html, /aria-labelledby="whatif-tab-meister"/);
});

test("the empty state uses the revised §2.4 wording", () => {
  const none = {
    status: "done",
    result: { deltas: { meister: { a: { baseline: 0.5, modified: 0.5, delta: 0, se: 0, floor: 0, significant: false } } } },
  };
  const html = strip(renderToStaticMarkup(React.createElement(WhatIfResult, { sim: none, targets, nameOf, runs: 20000, stale: false })));
  assert.match(html, /Keine messbare Veränderung — die festgesetzten Ergebnisse verschieben die Wahrscheinlichkeiten nicht stärker, als es der Zufall auch könnte/);
});

// ---------------------------------------------------------------------------
//  Verbatim text revisions (§2).
// ---------------------------------------------------------------------------

const src = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

test("§2.1/2.2/2.3 texts are present verbatim in Szenarien", () => {
  const s = src("apps/public/src/pages/Szenarien.jsx");
  assert.ok(s.includes("Was wäre, wenn …? Ergebnisse festsetzen und sehen, wie sich die Prognose verschiebt."));
  assert.ok(s.includes("neu ausgewürfelt — mal so, mal so, gemäß den Torraten beider Klubs"));
  assert.ok(s.includes("jedes Ergebnis verschiebt zugleich die Rechnung der Konkurrenten"));
  // The insider sentence is gone (§2.2).
  assert.ok(!s.includes("Tendenz-Was-wäre-wenn"));
});

test("§2.5 CONTENT CORRECTION: the wrong causal sentence must not return", () => {
  const m = src("apps/public/src/pages/Methodik.jsx");
  // The corrected step 1 wording is present…
  assert.ok(m.includes("Diese Streuung bildet unser Unwissen über die Stärke ab — der Zufall\n        eines einzelnen Spiels kommt erst in Schritt 2."));
  // …and the false claim is NOT in step 1 (it does not attribute a lost game to RATING_SIGMA).
  assert.ok(!m.includes("Ein Favorit gewinnt darum nicht in jedem Durchlauf."),
    "the wrong causal claim (loss caused by RATING_SIGMA) must not be present");
  // The honest version lives in step 2, tied to the goal draw.
  assert.ok(m.includes("Ein Favorit gewinnt darum nicht jedes Spiel — auch bei klaren Wahrscheinlichkeiten fällt\n        jedes Ergebnis einzeln."));
});

test("§SCORELINE_KONVENTION: Methodik step 2 carries the conditional-scoreline passage verbatim", () => {
  const m = src("apps/public/src/pages/Methodik.jsx");
  assert.ok(m.includes("Das wahrscheinlichste Einzelergebnis ist oft"));
  assert.ok(m.includes("Angezeigt wird deshalb überall das wahrscheinlichste Ergebnis"));
  assert.ok(m.includes("innerhalb der wahrscheinlichsten Tendenz"));
});

test("§2.6 the developer-jargon empty state is replaced", () => {
  const m = src("apps/public/src/pages/Methodik.jsx");
  assert.ok(m.includes("Die Beispielsaison braucht die aktuelle Prognoserechnung; sie liegt noch nicht vor."));
  assert.ok(!m.includes("committete Simulation gebraucht"));
});

test("§2.7 solver intro is the polished wording", () => {
  const s = src("apps/public/src/pages/Szenarien.jsx");
  assert.ok(s.includes("Der Vergleich wird bei Punktgleichheit zuungunsten des"));
});
