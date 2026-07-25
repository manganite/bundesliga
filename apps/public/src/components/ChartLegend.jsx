/**
 * The one legend every chart uses (§CHART_AUSBAU §0). Single-implementation
 * proof like `Disclosure`/`Tabs`: this file is the ONLY writer of the
 * `.chart-legend` markup — a source guard forbids a second.
 *
 * Plain HTML below the chart (real list, real buttons when interactive) so it is
 * reachable without hover and by keyboard. Each entry is a colour swatch beside
 * a full text label — colour is never the sole carrier.
 *
 * When `onToggle` is given the entries become toggle buttons (Verlauf: click a
 * club to highlight its series, click again to release). `active` is the key of
 * the highlighted entry, or null; the others render dimmed.
 *
 * @param {Array<{key:string,label:string,color:string}>} items
 * @param {(key:string)=>void} [onToggle]
 * @param {string|null} [active]
 */
export default function ChartLegend({ items, onToggle, active = null }) {
  return (
    <ul className="chart-legend" role={onToggle ? "group" : "list"} aria-label="Legende">
      {items.map((it) => {
        const dimmed = active != null && active !== it.key;
        const swatch = <span className="legend-swatch" style={{ background: it.color }} aria-hidden="true" />;
        return (
          <li key={it.key} className={dimmed ? "is-dimmed" : undefined}>
            {onToggle ? (
              <button
                type="button"
                className="legend-toggle"
                aria-pressed={active === it.key}
                onClick={() => onToggle(active === it.key ? null : it.key)}
              >
                {swatch}
                <span>{it.label}</span>
              </button>
            ) : (
              <>
                {swatch}
                <span>{it.label}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
