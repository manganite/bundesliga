// ============================================================================
//  Parsing the pasted Kicktipp page (§9), STRUCTURALLY (§KICKTIPP_PARSER_FIX).
//
//  PASTED CONTENT IS UNTRUSTED INPUT AND IS TREATED AS SUCH.
//
//   - parsed with `DOMParser`, never assigned via `innerHTML` or any equivalent
//   - only VALIDATED, TYPED fields (club names, odds, point rule, id) leave here
//   - anything unparsed is DISCARDED, not displayed
//
//  `DOMParser.parseFromString(..., "text/html")` builds an inert document: it
//  does not execute scripts and does not run event handlers. Nothing from the
//  paste is ever inserted into the live document — the UI renders the typed
//  fields as text nodes.
//
//  No automation against Kicktipp or Oddset. Manual paste only.
//
//  WHY STRUCTURAL, NOT POSITIONAL. Kicktipp renders a fixture as a responsive
//  „stack": the home cell (col1) carries the club name, the point rule
//  („3 - 9 - 9") AND the bookmaker odds (the `quote-heim/remis/gast` spans),
//  while the columns named for them (col3/col5) sit empty and hidden. The old
//  one-number-per-cell reader could never see that — and it was the very thing
//  that risked reading the point rule as odds. The positional number approach
//  is gone: odds come ONLY from the `tippabgabe-quoten` block, so the point
//  rule can never be mistaken for them.
// ============================================================================

export class ParseError extends Error {}

/**
 * A decimal number written with a point OR a comma as the separator — Kicktipp's
 * odds use a point („1.11"), the manual form uses German commas („2,45").
 */
export function parseDecimal(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/\s/g, "");
  if (!s) return null;
  // A comma means German notation (point = thousands); otherwise the point is
  // the decimal separator and is left in place.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The German-comma reader kept for the manual-entry form. */
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

// The pool's point rule per tendency: three payouts, each 3–9 („3 - 9 - 9").
const POINT_RULE = /^([3-9])\s*[-–]\s*([3-9])\s*[-–]\s*([3-9])$/;

/** Parse the „N - N - N" point rule; null if it is not that shape. */
export function parsePointRule(text) {
  const m = POINT_RULE.exec((text ?? "").trim());
  if (!m) return null;
  return { homeWin: Number(m[1]), draw: Number(m[2]), awayWin: Number(m[3]) };
}

/**
 * The three 1X2 bookmaker odds. Read PRIMARILY by the semantic label 1/X/2
 * (§KICKTIPP_MD1_QUOTENFIX §2): Kicktipp renders the block in two variants —
 * plain spans `quote-heim/quote-remis/quote-gast` (md2), or Oddset anchors
 * `quoteheim/quoteremis/quotegast` (no hyphen, md1) wrapping the same
 * `quote-label`/`quote-text`. The label is present and stable in BOTH, so it is
 * the primary key; the class spelling (either variant) is only a fallback.
 *
 * Returns null when the round carries no odds block at all — the app then runs
 * in model-only mode. A present-but-implausible odds set (≤ 1) also returns null
 * rather than a guess. The overround of a real (md1) set is removed downstream
 * by `impliedProbabilities` — no handling needed here.
 */
function extractOdds(scope) {
  const block = scope.querySelector(".tippabgabe-quoten");
  if (!block) return null;

  const byLabel = { 1: null, X: null, 2: null };
  for (const q of block.querySelectorAll(".quote")) {
    const label = cellText(q.querySelector(".quote-label"));
    const value = parseDecimal(cellText(q.querySelector(".quote-text")));
    if (label in byLabel && value != null) byLabel[label] = value;
  }
  let home = byLabel[1];
  let draw = byLabel.X;
  let away = byLabel[2];

  // Fallback: the class-based spelling, either variant, if a label is missing.
  const pickClass = (...classes) =>
    parseDecimal(cellText(block.querySelector(classes.map((c) => `.${c} .quote-text`).join(", "))));
  if (home == null) home = pickClass("quote-heim", "quoteheim");
  if (draw == null) draw = pickClass("quote-remis", "quoteremis");
  if (away == null) away = pickClass("quote-gast", "quotegast");

  if (home == null || draw == null || away == null) return null;
  if (!(home > 1) || !(draw > 1) || !(away > 1)) return null;
  return { home, draw, away };
}

const idOf = (row) => {
  const input = row.querySelector('input[name^="spieltippForms"]');
  return input?.getAttribute("name")?.match(/spieltippForms\[(\w+)\]/)?.[1] ?? null;
};

// A row is a fixture candidate unless it is a date/section header. Tolerant: the
// structural markers are preferred, but a row that merely carries two name cells
// still qualifies (the table may arrive without its id/classes after a paste).
function isCandidate(row) {
  if (row.classList.contains("rowheader")) return false;
  if (row.classList.contains("label")) return false;
  // Date/section rows span the table with a single colspan cell — on a td as
  // well as a th (the committed fixture uses `td colspan="99"`). Skip either, so
  // a class-less pasted fragment does not push them into the rejected list.
  if (row.querySelector("td[colspan], th[colspan]")) return false;
  return true;
}

/**
 * Parse a pasted Kicktipp tipping page into typed fixtures.
 *
 * @param {string} html      the pasted markup
 * @param {DOMParser} parser injectable so tests run without a browser
 * @returns {{fixtures: Array, skipped: Array}}  a skipped entry names why a row
 *   was not used, so the „Das habe ich verstanden" panel can show it (§3).
 */
export function parseTippPage(html, parser = new DOMParser()) {
  if (typeof html !== "string" || !html.trim()) throw new ParseError("nichts eingefügt");

  // Inert document: no scripts run, no handlers fire, nothing touches the page.
  const doc = parser.parseFromString(html, "text/html");

  const fixtures = [];
  const skipped = [];

  for (const row of doc.querySelectorAll("tr")) {
    if (!isCandidate(row)) continue;
    const cells = [...row.querySelectorAll("td, th")];
    if (cells.length < 2) continue;

    const col1 = row.querySelector("td.col1, th.col1") ?? cells[0];
    const col2 = row.querySelector("td.col2, th.col2") ?? cells[1];

    // Home/away: the stack element when present, else the plain cell text. In
    // the md1 variant BOTH clubs live in col1's stack (data-from 1 and 2) and
    // col2 is empty — so the stack element is searched across the WHOLE row,
    // mirror-symmetric for home and away (§KICKTIPP_MD1_QUOTENFIX §2).
    const homeRaw = cellText(row.querySelector('.stackElement[data-from="1"]')) || cellText(col1);
    const awayRaw = cellText(row.querySelector('.stackElement[data-from="2"]')) || cellText(col2);
    const home = sanitiseClubName(homeRaw);
    const away = sanitiseClubName(awayRaw);
    const id = idOf(row);

    if (!home || !away) {
      // Only report rows that actually held something — an empty spacer row is
      // not a „rejected fixture".
      const text = cells.map(cellText).filter(Boolean).join(" | ").slice(0, 120);
      if (text) skipped.push({ id, reason: "unvollständige Zeile (kein gültiges Vereinspaar)", text });
      continue;
    }

    // Odds ONLY from the named quote block; the point rule ONLY from its stack
    // element / col3. Neither can be mistaken for the other.
    const odds = extractOdds(col1) ?? extractOdds(row);
    const ruleText = cellText(col1.querySelector?.('.stackElement[data-from="3"]'))
      || cellText(row.querySelector("td.col3, th.col3"));
    const quotas = parsePointRule(ruleText);

    fixtures.push({ id, home, away, odds, quotas });
  }

  if (!fixtures.length) {
    throw new ParseError(
      "keine Spiele erkannt. Bitte die Tippabgabe-Seite vollständig kopieren (nicht nur den Text) "
      + "— oder in den DevTools das Tabellen-HTML kopieren.",
    );
  }
  return { fixtures, skipped };
}

/**
 * Resolve a pasted club name to a bundled club (§2). Matches BOTH the canonical
 * name and the verified Kicktipp form. Returns null rather than a near miss — an
 * unresolved club is reported by name, never guessed. Exactly one plausible
 * partial is accepted; two or more is ambiguous and left unresolved.
 *
 * @param {string} name   the pasted name
 * @param {Array<{name:string, kicktipp?:string}>} clubs  the register
 */
export function resolveClub(name, clubs) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const target = norm(name);
  if (!target) return null;
  let exact = null;
  const partial = [];
  for (const c of clubs) {
    const forms = [c.name, c.kicktipp].filter(Boolean).map(norm);
    if (forms.includes(target)) { exact = c; break; }
    if (forms.some((n) => n.includes(target) || target.includes(n))) partial.push(c);
  }
  if (exact) return exact;
  return partial.length === 1 ? partial[0] : null;
}

/**
 * The manual-entry fallback, validated on exactly the same terms as a paste.
 * Nothing reaches the UI that has not been through here.
 */
export function validateManualFixture(input) {
  const home = sanitiseClubName(input.home);
  const away = sanitiseClubName(input.away);
  if (!home || !away) throw new ParseError("Vereinsnamen fehlen oder enthalten unerlaubte Zeichen");

  let odds = null;
  if (input.odds && Object.keys(input.odds).length) {
    odds = {};
    for (const key of ["home", "draw", "away"]) {
      const v = typeof input.odds?.[key] === "number" ? input.odds[key] : parseGermanNumber(input.odds?.[key]);
      if (v === null || !(v > 1)) throw new ParseError(`Quote „${key}" fehlt oder ist unplausibel`);
      odds[key] = v;
    }
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
