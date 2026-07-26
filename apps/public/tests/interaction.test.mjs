import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { interactHarness, mount, pressKey, click, setValue } from "./harness/interact.mjs";

// ============================================================================
//  §Codex §1 — the client interaction layer. Four starter cases that the SSR
//  harness is structurally blind to: tab keyboard, a disclosure toggle, the
//  season/league remount (§2), and a scenario run (festsetzen → rechnen →
//  Veraltet-Dimmung).
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const maybe = (p) => (fs.existsSync(path.join(REPO, p)) ? read(p) : null);

const { React, bundle } = await interactHarness();
const h = React.createElement;

// ---------------------------------------------------------------------------
//  §3 · Tabs are fully keyboard-operable.
// ---------------------------------------------------------------------------

const tabsEl = (defaultId = "a") => h(bundle.Tabs, {
  idPrefix: "t", ariaLabel: "Test", defaultId,
  tabs: [
    { id: "a", label: "Eins", content: h("p", null, "A") },
    { id: "b", label: "Zwei", content: h("p", null, "B") },
    { id: "c", label: "Drei", content: h("p", null, "C") },
  ],
});

test("Tabs: ArrowRight/Left move focus AND selection cyclically, Home/End jump to the ends", async () => {
  const view = await mount(tabsEl());
  const tab = (id) => view.$(`#t-tab-${id}`);
  const selected = () => view.$all('[role="tab"]').find((b) => b.getAttribute("aria-selected") === "true").id;

  assert.equal(selected(), "t-tab-a");
  await pressKey(view, tab("a"), "ArrowRight");
  assert.equal(selected(), "t-tab-b");
  assert.equal(document.activeElement, tab("b")); // focus followed selection

  await pressKey(view, tab("b"), "ArrowRight");
  assert.equal(selected(), "t-tab-c");
  await pressKey(view, tab("c"), "ArrowRight"); // wraps
  assert.equal(selected(), "t-tab-a");

  await pressKey(view, tab("a"), "End");
  assert.equal(selected(), "t-tab-c");
  await pressKey(view, tab("c"), "Home");
  assert.equal(selected(), "t-tab-a");

  await pressKey(view, tab("a"), "ArrowLeft"); // wraps backwards
  assert.equal(selected(), "t-tab-c");
  view.unmount();
});

test("Tabs: roving tabindex — only the selected tab is in the tab order", async () => {
  const view = await mount(tabsEl());
  await pressKey(view, view.$("#t-tab-a"), "ArrowRight");
  const idx = (id) => view.$(`#t-tab-${id}`).tabIndex;
  assert.equal(idx("b"), 0);
  assert.equal(idx("a"), -1);
  assert.equal(idx("c"), -1);
  view.unmount();
});

// ---------------------------------------------------------------------------
//  §1 · A disclosure toggles on real interaction.
// ---------------------------------------------------------------------------

test("Disclosure: clicking the summary opens and closes the native <details>", async () => {
  const view = await mount(h(bundle.Disclosure, { summary: "Wie gerechnet?" }, h("p", null, "Methodik")));
  const details = view.$("details");
  const summary = view.$("summary");
  assert.equal(details.open, false);
  await click(view, summary);
  assert.equal(details.open, true);
  await click(view, summary);
  assert.equal(details.open, false);
  view.unmount();
});

// ---------------------------------------------------------------------------
//  §2 · Page state is bound to the data set — a season switch remounts it.
// ---------------------------------------------------------------------------

const PARAMS = read("data/season-params.json");
function dataFor(season, league) {
  return {
    meta: maybe("data/meta.json") ?? {},
    config: read(`data/seasons/${season}/config.json`),
    season: read(`data/seasons/${season}/${league}/season.json`),
    outlook: maybe(`data/seasons/${season}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${season}/${league}/timeline-frozen.json`),
    timelineLive: maybe(`data/seasons/${season}/${league}/timeline-live.json`),
    prematch: maybe(`data/seasons/${season}/${league}/prematch.json`),
    params: PARAMS,
    playoff: maybe(`data/seasons/${season}/playoff.json`),
    relegation: maybe("data/relegation.json"),
  };
}

const readyEl = (season, league, data) => h(bundle.Ready, {
  route: "teams", seasonId: season, league, data, isArchive: true,
  available: ["bl1", "bl2"], onLeague: () => {},
  seasons: [2014, 2015, 2026], season, newestSeason: 2026, onSeason: () => {},
});

test("Teams club selection does NOT survive a season switch (remount discards it)", async () => {
  const dataA = dataFor(2015, "bl1");
  const view = await mount(readyEl(2015, "bl1", dataA));
  const select = view.$("#club");
  assert.ok(select, "Teams renders a club <select>");

  // Pick a club that is NOT the default (the second option).
  const chosen = [...select.options].map((o) => o.value).find((v) => v !== select.value);
  await setValue(view, select, chosen);
  assert.equal(view.$("#club").value, chosen);

  // Switch season: the key (`2015-bl1` → `2014-bl1`) changes, Teams remounts.
  await view.render(readyEl(2014, "bl1", dataFor(2014, "bl1")));
  const after = view.$("#club").value;
  assert.notEqual(after, chosen, "the previous club leaked across the switch");
  const clubs2014 = new Set(read("data/seasons/2014/bl1/season.json").clubs.map((c) => c.clubId));
  assert.ok(clubs2014.has(after), "the reset club is one of the new season's clubs");
  view.unmount();
});

// ---------------------------------------------------------------------------
//  §1 · A full scenario run: festsetzen → rechnen → Veraltet-Dimmung.
// ---------------------------------------------------------------------------

const readySzen = () => h(bundle.Ready, {
  route: "szenarien", seasonId: 2026, league: "bl1", data: dataFor(2026, "bl1"), isArchive: false,
  available: ["bl1", "bl2"], onLeague: () => {},
  seasons: [2014, 2015, 2026], season: 2026, newestSeason: 2026, onSeason: () => {},
});

test("scenario: festsetzen then rechnen shows a result; a further change marks it stale", { timeout: 60000 }, async () => {
  const view = await mount(readySzen());
  const buttonsBy = (label) => view.$all("button").filter((b) => b.textContent.trim() === label);

  // Festsetzen the first open fixture, accept the prefilled modal scoreline.
  await click(view, buttonsBy("Festsetzen")[0]);
  await click(view, view.$all("button").find((b) => b.textContent.trim() === "übernehmen"));

  const run = () => view.$all("button").find((b) => b.textContent.trim() === "Szenario rechnen");
  assert.ok(run() && !run().disabled, "Szenario rechnen is enabled once an input differs");

  // Rechnen — the worker (polyfilled, synchronous) returns within the flush.
  await view.act(async () => {
    run().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(view.$(".whatif-result"), "a what-if result rendered after rechnen");
  assert.ok(!view.text().includes("Ergebnis veraltet"), "fresh result is not marked stale");

  // Change another input WITHOUT recomputing → the result dims (§1.4).
  await click(view, buttonsBy("Festsetzen")[0]);
  await click(view, view.$all("button").find((b) => b.textContent.trim() === "übernehmen"));
  assert.ok(view.text().includes("Ergebnis veraltet"), "the result is marked veraltet after a change");
  assert.ok(view.$(".whatif-result.is-stale"), "the stale result carries the dim class");
  view.unmount();
});
