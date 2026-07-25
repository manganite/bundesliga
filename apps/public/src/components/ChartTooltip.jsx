import { pp } from "../lib/format.js";

/**
 * The one tooltip every chart uses (§CHART_AUSBAU §0). Single-implementation
 * proof like `Disclosure`/`Tabs`: this file is the ONLY writer of the
 * `.chart-tooltip` markup — a source guard forbids a second.
 *
 * Standard layout: a title line (matchday/date) → value lines (label, value,
 * optional Δ to the previous point as `pp()`) → optional context lines. Colour
 * and hover are never the sole carriers: the focusable point that opens the
 * tooltip carries the same summary as an `aria-label` (see `HitAreas`), and the
 * chart's visually-hidden data table holds every number regardless.
 *
 * Rendered as an SVG `<foreignObject>` so it sits inside the chart frame without
 * changing `Chart`; `pointer-events: none` keeps it from stealing the hover.
 *
 * @param {number} x     the point's x in SVG units — the box is centred on it,
 *   then clamped inside [0, width].
 * @param {number} y     the box's top in SVG units.
 * @param {number} width the chart width, for clamping.
 * @param {string} title the title line.
 * @param {Array<{label:string,value:string,delta?:number,color?:string}>} rows
 * @param {string[]} context  optional extra lines (e.g. the biggest surprises).
 * @param {number} boxWidth  tooltip width in SVG units.
 */
export default function ChartTooltip({ x, y = 6, width, title, rows = [], context = [], boxWidth = 200 }) {
  const bx = Math.max(2, Math.min(x - boxWidth / 2, width - boxWidth - 2));
  // A generous height estimate — foreignObject needs one; content may be shorter.
  const height = 30 + rows.length * 19 + (context.length ? 8 + context.length * 16 : 0) + 12;

  return (
    <foreignObject x={bx} y={y} width={boxWidth} height={height} style={{ pointerEvents: "none", overflow: "visible" }}>
      <div className="chart-tooltip">
        <p className="tt-title">{title}</p>
        <ul className="tt-rows">
          {rows.map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i}>
              {r.color ? <span className="tt-swatch" style={{ background: r.color }} aria-hidden="true" /> : null}
              <span className="tt-label">{r.label}</span>
              <span className="tt-value">{r.value}</span>
              {r.delta != null ? <span className="tt-delta">{pp(r.delta)}</span> : null}
            </li>
          ))}
        </ul>
        {context.length ? (
          <ul className="tt-context">
            {/* eslint-disable-next-line react/no-array-index-key */}
            {context.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        ) : null}
      </div>
    </foreignObject>
  );
}
