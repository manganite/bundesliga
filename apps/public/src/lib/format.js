// German formatting helpers. The UI is German; code and comments are English.

// One fixed decimal for percentages, so a percentage column does not flicker
// between „5 %" and „13,4 %". digits === 0 callers use pct0Fmt instead.
const pctFmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0Fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("de-DE");
// Elo ratings are identifiers, not quantities — no thousands grouping („1678",
// never „1.678", which reads as 1.678).
const ratingFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0, useGrouping: false });

/**
 * A probability as a percentage.
 *
 * Values that are neither 0 nor 1 never round to „0 %" or „100 %": a genuine
 * possibility must not be displayed as an impossibility, and an unsettled race
 * must not be displayed as decided. That distinction is the whole point of the
 * clinch logic elsewhere.
 */
export function percent(p, digits = 1) {
  if (p == null || Number.isNaN(p)) return "–";
  if (p === 0) return "0 %";
  if (p === 1) return "100 %";
  const v = p * 100;
  if (v < 0.1) return "<0,1 %";
  if (v > 99.9) return ">99,9 %";
  return `${(digits === 0 ? pct0Fmt : pctFmt).format(v)} %`;
}

export const number = (v, digits = 1) => (v == null || Number.isNaN(v)
  ? "–"
  : new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v));

export const integer = (v) => (v == null || Number.isNaN(v) ? "–" : intFmt.format(v));

export const signed = (v, digits = 1) => (v == null || Number.isNaN(v)
  ? "–"
  : `${v > 0 ? "+" : v < 0 ? "−" : ""}${number(Math.abs(v), digits)}`);

export const signedInt = (v) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${intFmt.format(Math.abs(v))}`);

/** An Elo rating: a whole number without thousands grouping. */
export const rating = (v) => (v == null || Number.isNaN(v) ? "–" : ratingFmt.format(v));

/**
 * A signed change in percentage POINTS, e.g. „−14,8 Pp." — the ONE path for
 * percentage-point displays, so the minus sign is the real „−" everywhere and no
 * page hand-rolls its own. `delta` is a fraction (0.148), not already ×100.
 */
export const pp = (delta, digits = 1) => (delta == null || Number.isNaN(delta) ? "–" : `${signed(delta * 100, digits)} Pp.`);

/**
 * An UNSIGNED magnitude in percentage points, e.g. „2,6 Pp." — for quantities
 * that are distances or errors (calibration ECE, the fixture-impact shift), where
 * a „+" would be wrong. `value` is a fraction. The counterpart to `pp` so that
 * the „ Pp." suffix lives in exactly one file.
 */
export const points = (value, digits = 1) => (value == null || Number.isNaN(value) ? "–" : `${number(value * 100, digits)} Pp.`);

export function dateTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function dateShort(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function weekdayDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export const seasonLabel = (season) => `${season}/${String(Number(season) + 1).slice(2)}`;

export { numFmt };
