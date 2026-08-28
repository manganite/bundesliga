import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  The header brand. App.jsx renders two header variants — the shell that
//  stands while the data loads and the ready header — and the mark has to
//  appear in BOTH, exactly once. „Exactly once" is the half that catches the
//  likely regression: a second copy pasted in beside the shared component.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const { Shell, Ready, SiteBrand } = await harness();

// The live season comes from the committed meta, not from a literal: pinning
// „2026 is the newest" would keep passing when 2027 lands (the 2026 files stay
// committed as an archive) while quietly rendering an ARCHIVE season under
// `isArchive: false` — the header variant this test claims to cover would no
// longer be the one it renders. The archive partner stays a literal; 2015/16 is
// finished and cannot become the newest season again.
const LIVE = read("data/meta.json").season;
const ARCHIVE = 2015;

const marks = (html) => html.match(/class="site-mark"/g)?.length ?? 0;

function dataFor(year, league) {
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    meta: read("data/meta.json"),
    config: read(`data/seasons/${year}/config.json`),
    season: read(`data/seasons/${year}/${league}/season.json`),
    outlook: maybe(`data/seasons/${year}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${year}/${league}/timeline-frozen.json`),
    timelineLive: null,
    prematch: maybe(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
    playoff: null,
  };
}

test("the shell header (loading/error) carries the mark exactly once", () => {
  const html = renderToStaticMarkup(React.createElement(Shell, {
    children: "Daten werden geladen …",
    league: "bl1", available: ["bl1", "bl2"], onLeague: () => {},
    seasons: [ARCHIVE, LIVE], season: LIVE, newestSeason: LIVE, onSeason: () => {},
  }));
  assert.equal(marks(html), 1, "the shell header shows the mark once");
  assert.match(html, /<h1>Bundesliga-Simulator<\/h1>/, "the h1 stays the text anchor");
});

test("the ready header carries the mark exactly once", () => {
  const html = renderToStaticMarkup(React.createElement(Ready, {
    route: "methodik",
    seasonId: LIVE, league: "bl1", data: dataFor(LIVE, "bl1"), isArchive: false,
    available: ["bl1", "bl2"], onLeague: () => {},
    seasons: [ARCHIVE, LIVE], season: LIVE, newestSeason: LIVE, onSeason: () => {},
  }));
  assert.equal(marks(html), 1, "the ready header shows the mark once");
});

test("the mark is decorative — no alt-text double of the title", () => {
  const html = renderToStaticMarkup(React.createElement(SiteBrand, {}));
  assert.match(html, /aria-hidden="true"/, "the mark is hidden from assistive technology");
  assert.match(html, /alt=""/, "and carries an empty alt, not a second title");
  // One implementation: the tagline lives with the brand, not twice in App.jsx.
  assert.match(html, /class="tagline"/);
});

test("the brand hexes live in the asset, not in a component", () => {
  const svg = fs.readFileSync(path.join(REPO, "apps/public/src/assets/logo-mark.svg"), "utf8");
  assert.match(svg, /#2f6fe0/, "the OG blue anchors the gradient");
  assert.match(svg, /#8db9ff/, "lightened so the mark also carries on a dark ground");
  const jsx = fs.readFileSync(path.join(REPO, "apps/public/src/components/SiteBrand.jsx"), "utf8");
  assert.doesNotMatch(jsx, /#[0-9a-fA-F]{3,6}\b/, "no hex in the component (the token scan agrees)");
});
