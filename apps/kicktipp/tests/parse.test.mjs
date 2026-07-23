import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  parseTippPage, parseGermanNumber, sanitiseClubName, validateManualFixture, ParseError,
} from "../src/parse.mjs";

// A real DOMParser, in a document that WOULD run scripts if anything let it —
// `runScripts: "dangerously"` is deliberate here: it makes the "nothing
// executes" assertions meaningful rather than vacuous.
const dom = new JSDOM("", { runScripts: "dangerously" });
const parser = new dom.window.DOMParser();

const row = (home, away, oh, od, oa, extra = "") => `
  <tr><td>${home}</td><td>${away}</td><td>${oh}</td><td>${od}</td><td>${oa}</td>${extra}</tr>`;

const page = (rows) => `<table><tbody>${rows}</tbody></table>`;

test("a normal tipping page yields typed fixtures", () => {
  const { fixtures } = parseTippPage(
    page(row("FC Bayern München", "VfB Stuttgart", "1,45", "4,80", "6,20")),
    parser,
  );
  assert.equal(fixtures.length, 1);
  assert.deepEqual(fixtures[0].home, "FC Bayern München");
  assert.deepEqual(fixtures[0].away, "VfB Stuttgart");
  assert.deepEqual(fixtures[0].odds, { home: 1.45, draw: 4.8, away: 6.2 });
});

test("German decimal commas are read correctly", () => {
  assert.equal(parseGermanNumber("2,45"), 2.45);
  assert.equal(parseGermanNumber("1.234,5"), 1234.5);
  assert.equal(parseGermanNumber(" 3 "), 3);
  assert.equal(parseGermanNumber("keine Zahl"), null);
  assert.equal(parseGermanNumber(""), null);
  assert.equal(parseGermanNumber(null), null);
});

// ---------------------------------------------------------------------------
// Untrusted input. §11 requires exactly these three cases.
// ---------------------------------------------------------------------------

test("a pasted <script> tag does not execute, and its row is discarded entirely", () => {
  dom.window.__pwned = false;
  const malicious = page(
    `<tr><td>Bayern<script>window.__pwned = true;</script></td><td>Stuttgart</td>`
    + `<td>1,45</td><td>4,80</td><td>6,20</td></tr>`
    + row("SC Freiburg", "1. FC Köln", "2,10", "3,40", "3,30"),
  );
  const { fixtures, skipped } = parseTippPage(malicious, parser);

  assert.equal(dom.window.__pwned, false, "the pasted script must never run");
  // §9: anything unparsed is DISCARDED, not displayed. The poisoned row does
  // not come back in a cleaned-up form — it does not come back at all.
  assert.equal(fixtures.length, 1, "only the clean row survives");
  assert.equal(fixtures[0].home, "SC Freiburg");
  assert.equal(skipped.length, 1, "the rejected row is reported, not silently dropped");
  assert.ok(fixtures.every((f) => !/script|window|=/i.test(JSON.stringify(f))));
});

test("an inline event handler does not survive parsing", () => {
  const malicious = page(
    `<tr><td onclick="window.__pwned = true" onmouseover="alert(1)">Bayern</td>`
    + `<td>Stuttgart</td><td>1,45</td><td>4,80</td><td>6,20</td></tr>`,
  );
  const { fixtures } = parseTippPage(malicious, parser);
  // The parser returns strings and numbers. There is no element, no attribute
  // and therefore no handler that could reach the live document.
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    assert.equal(typeof f.away, "string");
    assert.doesNotMatch(JSON.stringify(f), /onclick|onmouseover|alert/i);
  }
});

test("an img with an onerror handler cannot smuggle anything through", () => {
  const malicious = page(
    `<tr><td><img src=x onerror="window.__pwned = true">Bayern</td><td>Stuttgart</td>`
    + `<td>1,45</td><td>4,80</td><td>6,20</td></tr>`,
  );
  dom.window.__pwned = false;
  const { fixtures } = parseTippPage(malicious, parser);
  assert.equal(dom.window.__pwned, false);
  assert.ok(fixtures.every((f) => !/onerror|img|src/i.test(JSON.stringify(f))));
});

test("malformed markup is handled without throwing something unexpected", () => {
  const broken = "<table><tr><td>Bayern<td>Stuttgart<td>1,45<td>4,80<td>6,20</table><div><span>";
  const { fixtures } = parseTippPage(broken, parser);
  assert.ok(Array.isArray(fixtures));
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    assert.equal(typeof f.odds.draw, "number");
  }
});

test("input with nothing recognisable fails loudly instead of returning junk", () => {
  assert.throws(() => parseTippPage("<p>Hallo</p>", parser), ParseError);
  assert.throws(() => parseTippPage("", parser), /nichts eingefügt/);
  assert.throws(() => parseTippPage(null, parser), ParseError);
});

test("every returned field is a plain string or number — no nodes, no markup", () => {
  const { fixtures } = parseTippPage(
    page(row("<b>Bayern</b>", "Stuttgart", "1,45", "4,80", "6,20")),
    parser,
  );
  for (const f of fixtures) {
    assert.equal(typeof f.home, "string");
    assert.doesNotMatch(f.home, /[<>]/);
    for (const v of Object.values(f.odds)) assert.equal(typeof v, "number");
  }
});

// ---------------------------------------------------------------------------
// name validation
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
