import { useId } from "react";

/**
 * The frame every chart in this app sits in.
 *
 * Carries the accessibility contract from §10 so no individual chart can forget
 * it:
 *   - role="img" with a DATA-DRIVEN aria-label (never a generic "chart")
 *   - <title> and <desc> inside the SVG
 *   - a visually-hidden data table, because every chart's numbers must also be
 *     available as a table
 *   - a plain-German takeaway caption
 *
 * `table` is required, not optional: a chart whose numbers cannot be tabulated
 * has no business being here.
 */
export default function Chart({
  title,
  description,
  ariaLabel,
  caption,
  width = 720,
  height = 320,
  table,
  children,
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaLabel ?? description ?? title}</desc>
        {children}
      </svg>

      {caption ? <figcaption>{caption}</figcaption> : null}

      <div className="visually-hidden">
        <table>
          <caption>{title} — Zahlen zur Grafik</caption>
          <thead>
            <tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i}>
                {row.map((cell, j) => (
                  // eslint-disable-next-line react/no-array-index-key
                  j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
