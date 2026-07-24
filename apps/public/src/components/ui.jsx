import { percent } from "../lib/format.js";
import Disclosure from "./Disclosure.jsx";

/**
 * A card. Empty cards HIDE (§10) — `when` is the emptiness test, and a card
 * with nothing to say renders nothing at all rather than an empty box.
 *
 * @param {boolean} [textOnly]  the card holds only flowing text (no table, chart
 *   or grid), so it shrinks to the text measure — text edge and card edge then
 *   coincide instead of leaving dead right-hand space.
 * @param {React.ReactNode} [method]  the methodology, shown behind a shared
 *   „Wie gerechnet?" disclosure. The RULE (§ZONEN_LAYOUT §3): a caption with more
 *   than two sentences splits into one or two visible sentences (the answer in
 *   the user's language) plus this — nothing honest is dropped, it moves behind
 *   the toggle. New cards follow this from birth.
 */
export function Card({ title, subtitle, caption, when = true, textOnly = false, method = null, children }) {
  if (!when) return null;
  return (
    <section className={textOnly ? "card text-only" : "card"}>
      <header>
        <h3>{title}</h3>
        {subtitle ? <p className="page-intro" style={{ margin: 0 }}>{subtitle}</p> : null}
      </header>
      {children}
      {caption ? <p className="caption">{caption}</p> : null}
      {method ? <Disclosure>{method}</Disclosure> : null}
    </section>
  );
}

/** A probability as a bar plus its number. The number is always present. */
export function ProbBar({ value, label }) {
  const width = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span className="prob-bar" style={{ flex: "1 1 4rem" }} aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
      <span style={{ minWidth: "3.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {label ?? percent(value)}
      </span>
    </span>
  );
}

/** A ranked probability list — the shape most Übersicht cards need. */
export function ProbList({ entries, nameOf, limit = 5, emptyText = "Nichts zu zeigen." }) {
  const shown = entries.filter((e) => e.value > 0).slice(0, limit);
  if (!shown.length) return <p className="empty">{emptyText}</p>;
  return (
    <table className="data">
      <tbody>
        {shown.map((e) => (
          <tr key={e.clubId}>
            <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(e.clubId)}</th>
            <td style={{ width: "55%" }}><ProbBar value={e.value} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

/** A simple/expert toggle. Simple is always the default (§10). */
export function ExpertToggle({ expert, onChange, labelSimple = "Expertenansicht zeigen", labelExpert = "Einfache Ansicht" }) {
  return (
    <button type="button" className="toggle-expert" onClick={() => onChange(!expert)}>
      {expert ? labelExpert : labelSimple}
    </button>
  );
}
