// ============================================================================
//  Parsing the pasted Kicktipp page (§9).
//
//  PASTED CONTENT IS UNTRUSTED INPUT AND IS TREATED AS SUCH.
//
//   - parsed with `DOMParser`, never assigned via `innerHTML` or any equivalent
//   - only VALIDATED, TYPED fields (club names, quotas, odds) leave this module
//   - anything unparsed is DISCARDED, not displayed
//
//  `DOMParser.parseFromString(..., "text/html")` builds an inert document: it
//  does not execute scripts and does not run event handlers. Nothing from the
//  paste is ever inserted into the live document — the UI renders the typed
//  fields below as text nodes.
//
//  No automation against Kicktipp or Oddset. Manual paste only.
// ============================================================================

export class ParseError extends Error {}

/** Numbers on the page are German: „2,45". */
export function parseGermanNumber(text) {
  if (text == null) return null;
  const cleaned = String(text).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** A club name is kept only if it looks like one. Everything else is discarded. */
export function sanitiseClubName(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 40) return null;
  // Letters, digits, spaces and the punctuation German club names actually use.
  if (!/^[\p{L}\p{N} .'()/&-]+$/u.test(text)) return null;
  return text;
}

const cellText = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * Parse a pasted Kicktipp tipping page.
 *
 * The page carries both the pool's Tippquoten (the 3–9 payout per tendency) and
 * the 1X2 bookmaker odds. Layouts vary, so this reads defensively: a row that
 * does not yield a complete, validated fixture is skipped and reported as
 * unparsed rather than half-rendered.
 *
 * @param {string} html      the pasted markup
 * @param {DOMParser} parser injectable so tests run without a browser
 */
export function parseTippPage(html, parser = new DOMParser()) {
  if (typeof html !== "string" || !html.trim()) throw new ParseError("nichts eingefügt");

  // Inert document: no scripts run, no handlers fire, nothing touches the page.
  const doc = parser.parseFromString(html, "text/html");

  const fixtures = [];
  const skipped = [];

  for (const row of doc.querySelectorAll("tr")) {
    const cells = [...row.querySelectorAll("td, th")].map(cellText);
    if (cells.length < 3) continue;

    // Two club names, then the numbers. Names are validated, not trusted.
    const names = cells.map(sanitiseClubName).filter(Boolean);
    const numbers = cells.map(parseGermanNumber).filter((n) => n !== null);

    // A fixture row needs two plausible club names and at least three numbers
    // that look like odds (> 1).
    const odds = numbers.filter((n) => n > 1 && n < 1000);
    if (names.length < 2 || odds.length < 3) {
      if (cells.some((c) => c.length)) skipped.push(cells.join(" | ").slice(0, 120));
      continue;
    }

    fixtures.push({
      home: names[0],
      away: names[1],
      // The three 1X2 bookmaker odds, in page order.
      odds: { home: odds[0], draw: odds[1], away: odds[2] },
      // Quotas, where the page carried a further three small numbers in the
      // 3–11 range. Absent means the user supplies them manually.
      quotas: extractQuotas(numbers),
      raw: cells.length,
    });
  }

  if (!fixtures.length) {
    throw new ParseError(
      "keine Spiele erkannt. Bitte die Tippabgabe-Seite vollständig kopieren, oder die Werte von Hand eintragen.",
    );
  }
  return { fixtures, skipped };
}

/**
 * Pull the pool quotas out of a row's numbers: three integers in the schema's
 * own range. Returns null when the page did not carry them, rather than
 * inventing values.
 */
function extractQuotas(numbers) {
  const candidates = numbers.filter((n) => Number.isInteger(n) && n >= 3 && n <= 9);
  if (candidates.length < 3) return null;
  const [homeWin, draw, awayWin] = candidates.slice(0, 3);
  return { homeWin, draw, awayWin };
}

/**
 * The manual-entry fallback, validated on exactly the same terms as a paste.
 * Nothing reaches the UI that has not been through here.
 */
export function validateManualFixture(input) {
  const home = sanitiseClubName(input.home);
  const away = sanitiseClubName(input.away);
  if (!home || !away) throw new ParseError("Vereinsnamen fehlen oder enthalten unerlaubte Zeichen");

  const odds = {};
  for (const key of ["home", "draw", "away"]) {
    const v = typeof input.odds?.[key] === "number" ? input.odds[key] : parseGermanNumber(input.odds?.[key]);
    if (v === null || !(v > 1)) throw new ParseError(`Quote „${key}" fehlt oder ist unplausibel`);
    odds[key] = v;
  }

  let quotas = null;
  if (input.quotas) {
    quotas = {};
    for (const key of ["homeWin", "draw", "awayWin"]) {
      const v = typeof input.quotas[key] === "number" ? input.quotas[key] : parseGermanNumber(input.quotas[key]);
      if (v === null || v < 3 || v > 9) throw new ParseError(`Tippquote „${key}" liegt außerhalb von 3–9`);
      quotas[key] = Math.round(v);
    }
  }

  return { home, away, odds, quotas };
}
