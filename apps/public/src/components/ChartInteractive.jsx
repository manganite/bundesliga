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
 * @param {number} top,bottom  the plot's vertical span in SVG units.
 * @param {number} x  screen-x of the label (near the left edge).
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
 * @param {number} top,bottom vertical span of the hit area.
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
