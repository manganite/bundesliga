import { Card } from "./ui.jsx";
import Tabs from "./Tabs.jsx";
import { targetList } from "../lib/season.js";
import { percent } from "../lib/format.js";

// ============================================================================
//  „Direkte Duelle" — one tab per target (§TEXTMASS_DUELLE), over the SAME tab
//  component the what-if result table uses.
//
//  The clubId already IS the short name the tables want (Bayern, Stuttgart, St.
//  Pauli …); nameOf() would give the full name, which is too long for the
//  compact „Klub P % · Klub P %" value.
// ============================================================================

/** „Bayern 95,1 % · Stuttgart 38,5 %" — the two values, each tied to its club. */
function DuelValue({ duel }) {
  return (
    <span className="duel-value">
      <strong>{duel.home}</strong> {percent(duel.pHome)} · <strong>{duel.away}</strong> {percent(duel.pAway)}
    </span>
  );
}

export default function DirekteDuelle({ duelList, leagueConfig, nameOf }) {
  if (!duelList.length) return null; // §7: a card with nothing to say hides.

  // Group by target, keep config order, drop targets with no duel.
  const byTarget = new Map();
  for (const d of duelList) {
    if (!byTarget.has(d.target)) byTarget.set(d.target, []);
    byTarget.get(d.target).push(d);
  }
  const order = targetList(leagueConfig);
  const groups = order
    .filter((t) => byTarget.has(t.id))
    .map((t) => ({
      id: t.id,
      label: t.label,
      // Hottest first: a duel is hottest when BOTH clubs are in the race, so by
      // min(P_A, P_B) descending; matchday ascending breaks ties.
      rows: byTarget.get(t.id).slice().sort((a, b) => b.heat - a.heat || (a.matchday ?? 0) - (b.matchday ?? 0)),
    }));

  // Default: the target with the single most brisant duel (largest heat) — the
  // same headline-effect rule as the scenario tabs.
  const defaultId = groups
    .slice()
    .sort((a, b) => b.rows[0].heat - a.rows[0].heat)[0].id;

  const tabs = groups.map((g) => ({
    id: g.id,
    label: g.label,
    preview: `(${g.rows.length})`,
    content: (
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Spieltag</th>
              <th scope="col" className="left">Duell</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((d) => (
              <tr key={d.fixtureId}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {d.matchday !== null ? `${d.matchday}. Spieltag` : "—"}
                </th>
                <td className="left"><DuelValue duel={d} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  }));

  return (
    <Card
      title="Direkte Duelle"
      caption="Verbleibende Spiele, in denen beide Klubs mindestens 10 % Chance auf dasselbe Ziel haben."
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Ein Tab je Ziel; innerhalb sortiert nach dem kleineren der beiden Werte — ein Duell ist am
          heißesten, wenn beide Klubs im Rennen sind. Der Spieltag ist der Zweitschlüssel. Die
          Schwelle von 10 % ist die θ-Regel aus §4.
        </p>
      }
    >
      <Tabs tabs={tabs} defaultId={defaultId} idPrefix="duelle" ariaLabel="Ziele mit direkten Duellen" />
    </Card>
  );
}
