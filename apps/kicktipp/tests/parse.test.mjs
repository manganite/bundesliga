import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import {
  parseTippPage, parseDecimal, parseGermanNumber, parsePointRule, resolveClub,
  sanitiseClubName, validateManualFixture, ParseError,
} from "../src/parse.mjs";

// A real DOMParser, in a document that WOULD run scripts if anything let it —
// `runScripts: "dangerously"` makes the „nothing executes" assertions meaningful.
const dom = new JSDOM("", { runScripts: "dangerously" });
const parser = new dom.window.DOMParser();

const FIXTURE = fs.readFileSync(
  path.resolve(import.meta.dirname, "fixtures/tippabgabe-2026-md2.html"), "utf8",
);

// ---------------------------------------------------------------------------
//  §4 · The committed fixture is the parser reference — real Kicktipp markup.
// ---------------------------------------------------------------------------

test("the fixture parses to exactly nine fixtures, none skipped", () => {
  const { fixtures, skipped } = parseTippPage(FIXTURE, parser);
  assert.equal(fixtures.length, 9);
  assert.equal(skipped.length, 0);
});

test("row 1 is read word-exact: VfB Stuttgart – 1. FC Köln, rule 3-9-9, odds 1.11/18.9/22.0, id 1503034643", () => {
  const { fixtures } = parseTippPage(FIXTURE, parser);
  assert.deepEqual(fixtures[0], {
    id: "1503034643",
    home: "VfB Stuttgart",
    away: "1. FC Köln",
    odds: { home: 1.11, draw: 18.9, away: 22 },
    quotas: { homeWin: 3, draw: 9, awayWin: 9 },
  });
});

test("all nine pairings and ids come through in order", () => {
  const { fixtures } = parseTippPage(FIXTURE, parser);
  assert.deepEqual(fixtures.map((f) => `${f.id} ${f.home}–${f.away}`), [
    "1503034643 VfB Stuttgart–1. FC Köln",
    "1503034649 Werder Bremen–RB Leipzig",
    "1503034650 Bor. Mönchengladbach–SV Elversberg",
    "1503034645 Bayer 04 Leverkusen–1. FC Union Berlin",
    "1503034648 SC Paderborn 07–SC Freiburg",
    "1503034642 1899 Hoffenheim–Borussia Dortmund",
    "1503034644 FC Schalke 04–FC Bayern München",
    "1503034646 Hamburger SV–FSV Mainz 05",
    "1503034647 Eintracht Frankfurt–FC Augsburg",
  ]);
});

// ---------------------------------------------------------------------------
//  §4 · Number formats and the point-rule shape.
// ---------------------------------------------------------------------------

test("odds numbers read with a point OR a comma", () => {
  assert.equal(parseDecimal("1.11"), 1.11);
  assert.equal(parseDecimal("22.0"), 22);
  assert.equal(parseDecimal("2,45"), 2.45);
  assert.equal(parseDecimal(" 18.9 "), 18.9);
  assert.equal(parseDecimal("keine"), null);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal(null), null);
  // The German-comma reader stays for the manual form.
  assert.equal(parseGermanNumber("2,45"), 2.45);
  assert.equal(parseGermanNumber("1.234,5"), 1234.5);
});

test("the point rule accepts only three digits 3–9", () => {
  assert.deepEqual(parsePointRule("3 - 9 - 9"), { homeWin: 3, draw: 9, awayWin: 9 });
  assert.deepEqual(parsePointRule("9 - 6 - 3"), { homeWin: 9, draw: 6, awayWin: 3 });
  assert.equal(parsePointRule("2 - 9 - 9"), null, "below 3");
  assert.equal(parsePointRule("3 - 10 - 9"), null, "above 9 / two digits");
  assert.equal(parsePointRule("3 - 9"), null, "too few");
  assert.equal(parsePointRule(""), null);
});

// ---------------------------------------------------------------------------
//  §4 · The confusion test — the point rule must NEVER be read as odds.
// ---------------------------------------------------------------------------

test("a row carrying ONLY the point rule (no quote block) yields no odds", () => {
  const html = `<table><tr class="datarow">
    <td class="cell col1"><div class="stack">
      <div class="stackElement" data-from="1">FC Bayern München</div>
      <div class="stackElement" data-from="3">3 - 9 - 9</div>
    </div></td>
    <td class="cell col2">VfB Stuttgart</td>
    <td class="cell col4"><input name="spieltippForms[42].heimTipp"></td>
  </tr></table>`;
  const { fixtures } = parseTippPage(html, parser);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].odds, null, "the 3-9-9 point rule was NOT mistaken for odds");
  assert.deepEqual(fixtures[0].quotas, { homeWin: 3, draw: 9, awayWin: 9 });
});

// ---------------------------------------------------------------------------
//  §4 · Model-only mode — a round without a quote block.
// ---------------------------------------------------------------------------

test("a fixture without a quote block comes back with odds null (model-only)", () => {
  const html = `<table><tr class="datarow">
    <td class="cell col1"><div class="stack"><div class="stackElement" data-from="1">SC Freiburg</div></div></td>
    <td class="cell col2">1. FC Köln</td>
  </tr></table>`;
  const { fixtures } = parseTippPage(html, parser);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].odds, null);
});

// ---------------------------------------------------------------------------
//  §4 · Club resolution — Kicktipp forms match; the unknown is not guessed.
// ---------------------------------------------------------------------------

const REGISTER = [
  { clubId: "Gladbach", name: "Borussia Mönchengladbach", kicktipp: "Bor. Mönchengladbach" },
  { clubId: "Hoffenheim", name: "TSG Hoffenheim", kicktipp: "1899 Hoffenheim" },
  { clubId: "Stuttgart", name: "VfB Stuttgart", kicktipp: "VfB Stuttgart" },
];

test("the Kicktipp form resolves to its club; an unknown name resolves to null", () => {
  assert.equal(resolveClub("Bor. Mönchengladbach", REGISTER)?.clubId, "Gladbach");
  assert.equal(resolveClub("1899 Hoffenheim", REGISTER)?.clubId, "Hoffenheim");
  assert.equal(resolveClub("Borussia Mönchengladbach", REGISTER)?.clubId, "Gladbach"); // canonical too
  assert.equal(resolveClub("FC Fantasialand", REGISTER), null, "unknown → never guessed");
});

const REPO = path.resolve(import.meta.dirname, "../../..");
const MAPPING = JSON.parse(fs.readFileSync(
  path.resolve(import.meta.dirname, "../scripts/kicktipp-names.json"), "utf8",
)).names;

test("BL2 Kicktipp forms resolve to their clubs — incl. the ones canonical alone would miss", () => {
  // Sample the divergence-prone BL2 forms (§2). „Arminia Bielefeld" drops the
  // „DSC" its canonical carries; the others are long forms Kicktipp keeps.
  const register = [
    { clubId: "Heidenheim", name: "1. FC Heidenheim 1846", kicktipp: "1. FC Heidenheim 1846" },
    { clubId: "Cottbus", name: "Energie Cottbus", kicktipp: "Energie Cottbus" },
    { clubId: "Fürth", name: "SpVgg Greuther Fürth", kicktipp: "SpVgg Greuther Fürth" },
    { clubId: "Bielefeld", name: "DSC Arminia Bielefeld", kicktipp: "Arminia Bielefeld" },
  ];
  assert.equal(resolveClub("1. FC Heidenheim 1846", register)?.clubId, "Heidenheim");
  assert.equal(resolveClub("Energie Cottbus", register)?.clubId, "Cottbus");
  assert.equal(resolveClub("SpVgg Greuther Fürth", register)?.clubId, "Fürth");
  assert.equal(resolveClub("Arminia Bielefeld", register)?.clubId, "Bielefeld");
});

test("the mapping carries a verified Kicktipp form for all 36 current clubs (BL1 + BL2)", () => {
  const ids = new Set(Object.keys(MAPPING));
  const missing = [];
  for (const lg of ["bl1", "bl2"]) {
    const season = JSON.parse(fs.readFileSync(path.join(REPO, `data/seasons/2026/${lg}/season.json`), "utf8"));
    for (const c of season.clubs) if (!ids.has(c.clubId)) missing.push(`${lg}/${c.clubId}`);
  }
  assert.deepEqual(missing, [], "these current clubs lack a Kicktipp form");
});

test("every club of the committed fixture has a verified Kicktipp form in the mapping (BL1 acceptance)", () => {
  // Check the committed mapping, not the generated clubs.json (a build artefact
  // that does not exist when `node --test` runs in CI). Every fixture name IS a
  // Kicktipp form, so it must appear among the mapping's values — that is what
  // guarantees `resolveClub` matches it exactly for a real BL1 paste.
  const mapping = JSON.parse(fs.readFileSync(
    path.resolve(import.meta.dirname, "../scripts/kicktipp-names.json"), "utf8",
  ));
  const forms = new Set(Object.values(mapping.names));
  const { fixtures } = parseTippPage(FIXTURE, parser);
  const missing = [];
  for (const f of fixtures) {
    if (!forms.has(f.home)) missing.push(f.home);
    if (!forms.has(f.away)) missing.push(f.away);
  }
  assert.deepEqual(missing, [], "these fixture clubs lack a verified Kicktipp form");
  // And they resolve against a register built from those verified forms.
  const register = Object.entries(mapping.names).map(([clubId, name]) => ({ clubId, name, kicktipp: name }));
  for (const f of fixtures) {
    assert.ok(resolveClub(f.home, register), `home unresolved: ${f.home}`);
    assert.ok(resolveClub(f.away, register), `away unresolved: ${f.away}`);
  }
});

// ---------------------------------------------------------------------------
//  Untrusted input — the security guarantees are unchanged (§4). Malicious
//  content is DISCARDED, not sanitised; nothing executes. (Odds may legitimately
//  be null now — model-only mode — so those assertions no longer assume them.)
// ---------------------------------------------------------------------------

const nameRow = (home, away, extraHomeMarkup = "") => `
  <tr class="datarow"><td class="cell col1">${home}${extraHomeMarkup}</td><td class="cell col2">${away}</td></tr>`;
const pageOf = (rows) => `<table><tbody>${rows}</tbody></table>`;

test("a pasted <script> tag does not execute, and its row is discarded entirely", () => {
  dom.window.__pwned = false;
  const malicious = pageOf(
    nameRow("Bayern", "Stuttgart", "<script>window.__pwned = true;</script>")
    + nameRow("SC Freiburg", "1. FC Köln"),
  );
  const { fixtures, skipped } = parseTippPage(malicious, parser);
  assert.equal(dom.window.__pwned, false, "the pasted script must never run");
  assert.equal(fixtures.length, 1, "only the clean row survives");
  assert.equal(fixtures[0].home, "SC Freiburg");
  assert.equal(skipped.length, 1, "the rejected row is reported, not silently dropped");
  assert.ok(fixtures.every((f) => !/script|window|=/i.test(JSON.stringify(f))));
});

test("an inline event handler does not survive parsing", () => {
  const malicious = pageOf(
    `<tr class="datarow"><td class="cell col1" onclick="window.__pwned = true" onmouseover="alert(1)">Bayern</td>`
    + `<td class="cell col2">Stuttgart</td></tr>`,
  );
  const { fixtures } = parseTippPage(malicious, parser);
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    assert.equal(typeof f.away, "string");
    assert.doesNotMatch(JSON.stringify(f), /onclick|onmouseover|alert/i);
  }
});

test("an img with an onerror handler cannot smuggle anything through", () => {
  dom.window.__pwned = false;
  const malicious = pageOf(nameRow("Bayern", "Stuttgart", `<img src=x onerror="window.__pwned = true">`));
  const { fixtures } = parseTippPage(malicious, parser);
  assert.equal(dom.window.__pwned, false);
  assert.ok(fixtures.every((f) => !/onerror|img|src/i.test(JSON.stringify(f))));
});

test("malformed markup is handled without throwing something unexpected", () => {
  const broken = `<table><tr class="datarow"><td class="cell col1">Bayern<td class="cell col2">Stuttgart</table><div><span>`;
  const { fixtures } = parseTippPage(broken, parser);
  assert.ok(Array.isArray(fixtures));
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    if (f.odds) assert.equal(typeof f.odds.draw, "number");
  }
});

test("input with nothing recognisable fails loudly instead of returning junk", () => {
  assert.throws(() => parseTippPage("<p>Hallo</p>", parser), ParseError);
  assert.throws(() => parseTippPage("", parser), /nichts eingefügt/);
  assert.throws(() => parseTippPage(null, parser), ParseError);
});

test("every returned field is a plain string or number — no nodes, no markup", () => {
  const { fixtures } = parseTippPage(pageOf(nameRow("<b>Bayern</b>", "Stuttgart")), parser);
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    assert.doesNotMatch(f.home, /[<>]/);
    if (f.odds) for (const v of Object.values(f.odds)) assert.equal(typeof v, "number");
  }
});

// ---------------------------------------------------------------------------
//  name validation
// ---------------------------------------------------------------------------

test("club names are validated, not merely escaped", () => {
  assert.equal(sanitiseClubName("1. FC Köln"), "1. FC Köln");
  assert.equal(sanitiseClubName("Borussia Mönchengladbach"), "Borussia Mönchengladbach");
  assert.equal(sanitiseClubName("  TSG   1899  Hoffenheim "), "TSG 1899 Hoffenheim");
  assert.equal(sanitiseClubName("<script>x</script>"), null);
  assert.equal(sanitiseClubName("a"), null, "too short");
  assert.equal(sanitiseClubName("x".repeat(41)), null, "too long");
  assert.equal(sanitiseClubName(42), null);
});

test("manual entry is validated on the same terms as a paste", () => {
  const ok = validateManualFixture({
    home: "FC Bayern München",
    away: "VfB Stuttgart",
    odds: { home: "1,45", draw: "4,80", away: "6,20" },
    quotas: { homeWin: 3, draw: 6, awayWin: 8 },
  });
  assert.equal(ok.odds.home, 1.45);
  assert.deepEqual(ok.quotas, { homeWin: 3, draw: 6, awayWin: 8 });

  assert.throws(() => validateManualFixture({ home: "<b>x</b>", away: "Y", odds: {} }), ParseError);
  assert.throws(
    () => validateManualFixture({ home: "Bayern", away: "Stuttgart", odds: { home: "0,5", draw: 3, away: 4 } }),
    /unplausibel/,
  );
  assert.throws(
    () => validateManualFixture({
      home: "Bayern", away: "Stuttgart", odds: { home: 2, draw: 3, away: 4 },
      quotas: { homeWin: 12, draw: 5, awayWin: 5 },
    }),
    /außerhalb von 3–9/,
  );
});
