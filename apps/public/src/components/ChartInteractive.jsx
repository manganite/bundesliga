import { useState } from "react";

/**
 * The shared interaction layer behind every chart tooltip (§CHART_AUSBAU §0):
 * a pointer + touch + keyboard path over a chart's discrete x-slots (matchdays
 * or bars). `HitAreas` renders one focusable transparent rect per slot; the
 * active slot drives the shared `ChartTooltip`.
 *
 * The keyboard path is real: an focused point takes ArrowRight/Left (or
 * Up/Down) to step across slots and Escape to dismiss. Each rect carries the
 * point's summary as an `aria-label`, so the same information a sighted user
 * sees on hover reaches a screen-reader user on focus — colour and hover are
 * never the only carriers.
 */
/**
 * The Y-axis unit label, rotated vertically in the left margin (§CHART_AUSBAU
 * §0). Horizontal placement collided with the topmost tick („1%0 %"); the
 * conventional vertical label centred on the axis clears both the scale and the
 * data. Callers give the axis a left padding of ~52+ so the ticks sit right of
 * this label.
 *
 * @param {string} label  the unit („%", „Brier", „Bewerber", …)
 * @param {number} top  the plot's top edge in SVG units.
 * @param {number} bottom  the plot's bottom edge in SVG units.
 * @param {number} [x=13]  screen-x of the label (near the left edge).
 */
export function YAxisTitle({ label, top, bottom, x = 13 }) {
  const cy = (top + bottom) / 2;
  return (
    <text x={-cy} y={x} transform="rotate(-90)" textAnchor="middle" className="axis-title">{label}</text>
  );
}

export function useActivePoint(count) {
  const [active, setActive] = useState(null);
  const onKeyDown = (e) => {
    if (count === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      setActive((a) => Math.min(count - 1, (a ?? -1) + 1));
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      setActive((a) => Math.max(0, (a ?? count) - 1));
      e.preventDefault();
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };
  return { active, setActive, onKeyDown };
}

/**
 * One transparent, focusable hit rect per x-slot. Each spans the midpoints to
 * its neighbours (full plot height), so hovering anywhere over a matchday's
 * column activates it. Touch taps hold the tooltip; focus opens it; blur/leave
 * closes it.
 *
 * @param {number[]} centers  x-centre of each slot, in SVG units, ascending.
 * @param {number} top  top edge of the hit area, in SVG units.
 * @param {number} bottom  bottom edge of the hit area, in SVG units.
 * @param {(i:number)=>string} labelAt  the aria-label for slot i.
 */
export function HitAreas({ centers, top = 0, bottom, active, setActive, onKeyDown, labelAt }) {
  return centers.map((cx, i) => {
    const left = i === 0 ? 0 : (centers[i - 1] + cx) / 2;
    const right = i === centers.length - 1 ? cx + (cx - left) : (centers[i + 1] + cx) / 2;
    return (
      <rect
        key={i}
        x={left}
        y={top}
        width={Math.max(1, right - left)}
        height={bottom - top}
        fill="transparent"
        tabIndex={0}
        role="button"
        aria-label={labelAt(i)}
        aria-pressed={active === i}
        className="chart-hit"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setActive(i)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(i)}
        onBlur={() => setActive(null)}
        onTouchStart={(e) => { e.preventDefault(); setActive(i); }}
        onKeyDown={onKeyDown}
      />
    );
  });
}

/**
 * The half-season marker (§HALBSERIEN §2): one vertical rule at the boundary
 * matchday, on every matchday-axis chart that spans it.
 *
 * ONE implementation, like `ChartTooltip` and `ChartLegend` — a source guard
 * forbids a second writer of `.half-marker`. Three charts draw it (Verlauf, the
 * Teams zone stack, the Modellgüte quality series) and they must agree to the
 * pixel about where the season halves, or the eye reads three different
 * boundaries.
 *
 * It renders NOTHING when the boundary is unset or outside the plotted range —
 * a marker on a chart that stops at matchday 9 would assert a boundary the data
 * has not reached. It is decorative: the same fact is in the axis and in the
 * tooltip, so it carries `aria-hidden` rather than a second announcement.
 *
 * @param {number|null} boundary  the configured half-season matchday
 * @param {number} maxMatchday    the largest matchday actually plotted
 * @param {(md:number)=>number} x  the chart's own x scale
 * @param {number} top
 * @param {number} bottom
 * @param {boolean} [label=true]  draw the „Halbserie" caption above the rule
 */
export function HalfSeasonMarker({ boundary, maxMatchday, x, top, bottom, label = true }) {
  if (!boundary || !(maxMatchday > boundary)) return null;
  const cx = x(boundary);
  return (
    <g className="half-marker" aria-hidden="true">
      <line x1={cx} y1={top} x2={cx} y2={bottom} />
      {label ? (
        <text x={cx + 4} y={top + 10} className="axis-label">Halbserie</text>
      ) : null}
    </g>
  );
}
