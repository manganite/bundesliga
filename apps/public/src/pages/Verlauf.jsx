import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import { targetList } from "../lib/season.js";
import { effectiveContenders } from "../../../../packages/engine/src/metrics.mjs";
import { percent, number } from "../lib/format.js";

const SERIES_COLOURS = [
  "var(--accent)", "#e0733a", "#0f7b4f", "#8b5cd6", "#c0396b", "#2f8f9d", "#a07b1f", "#4b6a8f",
];

/**
 * Verlauf — the frozen curve (V1) and, since V1.2, the comparison against the
 * curve computed with the ratings that actually applied at the time.
 *
 * THE COMPARISON IS DESCRIPTIVE, NOT A DECOMPOSITION. An earlier draft called
 * the gap a „revaluation effect" and the frozen curve a „points effect". That is
 * causal language for a counterfactual contrast, and it is wrong: the frozen
 * curve also carries reduced remaining uncertainty, a changed table and tiebreak
 * situation, and schedule interactions. The two curves therefore carry the
 * neutral §0 labels verbatim, and the caption says what the contrast is and what
 * it is not.
 */
const CURVE_LABEL = {
  frozen: "Prognose mit eingefrorener Saisonstart-Stärke",
  live: "zusätzliche Veränderung bei aktuellen Ratings",
};

export default function Verlauf({ ctx }) {
  const { timeline, timelineLive, leagueConfig, nameOf, leagueLabel } = ctx;
  const targets = targetList(leagueConfig);
  const [targetId, setTargetId] = useState(targets[0]?.id);

  const target = targets.find((t) => t.id === targetId) ?? targets[0];

  const series = useMemo(() => {
    if (!timeline?.points?.length || !target) return null;
    const clubs = Object.keys(timeline.points[0].probabilities?.[target.id] ?? {});
    const byClub = clubs.map((clubId) => ({
      clubId,
      points: timeline.points.map((p) => ({
        matchday: p.matchday,
        value: p.probabilities?.[target.id]?.[clubId] ?? 0,
      })),
    }));
    // Only clubs the curve ever says anything about, most prominent first.
    return byClub
      .map((s) => ({ ...s, peak: Math.max(...s.points.map((p) => p.value)) }))
      .filter((s) => s.peak > 0.02)
      .sort((a, b) => b.peak - a.peak)
      .slice(0, 8);
  }, [timeline, target]);

  const tensionSeries = useMemo(() => {
    if (!timeline?.points?.length || !target) return null;
    return timeline.points.map((p) => {
      const probs = Object.values(p.probabilities?.[target.id] ?? {});
      if (!probs.length || probs.every((x) => x === 0)) return { matchday: p.matchday, value: null };
      return { matchday: p.matchday, value: effectiveContenders(probs, target.places).value };
    });
  }, [timeline, target]);

  if (!timeline?.points?.length) {
    return (
      <Empty>
        Für diese Saison liegt noch keine Verlaufssimulation vor. Sie entsteht in der Pipeline
        und wird committet — sie wird nicht im Browser nachgerechnet.
      </Empty>
    );
  }

  const degraded = timeline.label?.degraded;

  return (
    <>
      <h2>Verlauf — {leagueLabel}</h2>
      <p className="page-intro">
        Wie sich die Aussichten im Lauf der Saison verschoben haben — allein durch Ergebnisse,
        bei unveränderter Saisonstart-Stärke.
      </p>

      {degraded ? (
        <p className="banner warn">{timeline.label.label}</p>
      ) : null}

      <div className="controls">
        <label htmlFor="target">Ziel</label>
        <select id="target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div className="stack">
        <Card title={`${target?.label} im Saisonverlauf`}>
          {series?.length
            ? <MultiLine series={series} nameOf={nameOf} targetLabel={target.label} label={timeline.label?.label} />
            : <Empty>Zu diesem Ziel gibt es im Verlauf nichts zu zeigen.</Empty>}
        </Card>

        <Card
          title="Spannungsindex im Verlauf"
          when={Boolean(tensionSeries)}
          caption={
            `Effektive Zahl der Bewerber, exp(H), normalisiert vor der Entropie. `
            + `Für „${target?.label}“ mit ${target?.places} ${target?.places === 1 ? "Platz" : "Plätzen"} ist der `
            + `tiefste mögliche Wert ${number(target?.places, 1)} — dann ist alles entschieden, nicht 1,0.`
          }
        >
          <TensionLine series={tensionSeries} floor={target?.places ?? 1} targetLabel={target?.label} />
        </Card>

        <FrozenVsLive
          timeline={timeline}
          timelineLive={timelineLive}
          target={target}
          nameOf={nameOf}
        />

        <Card title="Was diese Kurven sind">
          <p className="caption" style={{ margin: 0 }}>
            Die Grundkurve verwendet durchgehend dieselben Ratings vom Saisonstart
            {timeline.frozenEffectiveAt ? ` (Stand ${timeline.frozenEffectiveAt})` : ""}; nur die Menge der
            bekannten Ergebnisse wächst. Sie enthält also keine Rating-Aktualisierungen.
            {timelineLive?.points?.length
              ? " Die Gegenüberstellung darunter zeigt daneben die Kurve mit den Ratings, die zum jeweiligen Zeitpunkt tatsächlich galten."
              : " Die Gegenüberstellung mit aktuellen Ratings erscheint, sobald archivierte Ratings für gespielte Spieltage vorliegen."}
            {" "}Jeder Punkt beruht auf {number(timeline.runs, 0)} Simulationsläufen.
          </p>
        </Card>
      </div>
    </>
  );
}

/**
 * Push labels apart so none sits on top of another.
 *
 * Greedy from the top: keep the natural position where possible, otherwise
 * nudge down by the minimum gap. Series ending under 0.5 % are dropped — the
 * exact numbers are in the chart's data table, and a pile of illegible names is
 * worse than no label.
 */
function placeLabels(items, minGap) {
  const kept = items.filter((i) => i.value >= 0.005).sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const item of kept) {
    item.y = Math.max(item.y, last + minGap);
    last = item.y;
  }
  return kept;
}

function MultiLine({ series, nameOf, targetLabel, label }) {
  const w = 760;
  const h = 320;
  const pad = { l: 44, r: 150, t: 12, b: 32 };
  const maxX = Math.max(...series[0].points.map((p) => p.matchday), 1);
  const x = (md) => pad.l + (md / maxX) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - v * (h - pad.t - pad.b);

  const last = series.map((s) => ({
    clubId: s.clubId,
    value: s.points[s.points.length - 1].value,
  }));

  return (
    <Chart
      title={`${targetLabel} je Spieltag`}
      ariaLabel={
        `Liniendiagramm mit ${series.length} Klubs: Wahrscheinlichkeit für „${targetLabel}“ über die Spieltage. `
        + `Am Ende führt ${nameOf(last.slice().sort((a, b) => b.value - a.value)[0].clubId)} `
        + `mit ${percent(Math.max(...last.map((l) => l.value)))}.`
      }
      width={w}
      height={h}
      caption={`${label ?? "Eingefrorene Saisonstart-Stärke"}. Gezeigt sind die Klubs, die im Verlauf mindestens einmal über 2 % kamen.`}
      table={{
        columns: ["Klub", ...series[0].points.map((p) => (p.matchday === 0 ? "vor dem 1." : `${p.matchday}.`))],
        rows: series.map((s) => [nameOf(s.clubId), ...s.points.map((p) => percent(p.value))]),
      }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{Math.round(v * 100)} %</text>
        </g>
      ))}
      {series.map((s, i) => (
        <path
          key={s.clubId}
          d={s.points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.matchday).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      ))}
      {/* Labels are de-overlapped: several clubs finish at almost the same
          value, and stacked text at the same y is unreadable. Series that end
          below 0.5 % are left unlabelled — they are still in the data table
          below, which is where the exact numbers belong anyway. */}
      {placeLabels(series.map((s, i) => ({
        clubId: s.clubId,
        colour: SERIES_COLOURS[i % SERIES_COLOURS.length],
        value: s.points[s.points.length - 1].value,
        y: y(s.points[s.points.length - 1].value),
      })), 13).map((l) => (
        <text
          key={`lab-${l.clubId}`}
          x={w - pad.r + 8}
          y={l.y + 4}
          className="axis-label"
          fill={l.colour}
        >
          {nameOf(l.clubId).length > 16 ? `${nameOf(l.clubId).slice(0, 15)}…` : nameOf(l.clubId)}
        </text>
      ))}
      <text x={w - pad.r} y={h - 8} textAnchor="end" className="axis-label">Spieltag</text>
    </Chart>
  );
}

/** Whole-number ticks that stay readable however tall the axis is. */
function tickValues(maxY) {
  const step = maxY <= 4 ? 1 : maxY <= 10 ? 2 : 5;
  const out = [];
  for (let v = 0; v <= maxY; v += step) out.push(v);
  return out;
}

function TensionLine({ series, floor, targetLabel }) {
  const usable = series.filter((p) => p.value != null);
  if (!usable.length) return <Empty>Kein Verlauf verfügbar.</Empty>;

  const w = 760;
  const h = 220;
  const pad = { l: 44, r: 12, t: 12, b: 32 };
  const maxX = Math.max(...usable.map((p) => p.matchday), 1);
  const maxY = Math.max(...usable.map((p) => p.value), floor + 1);
  const x = (md) => pad.l + (md / maxX) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);

  return (
    <Chart
      title={`Spannungsindex für ${targetLabel}`}
      ariaLabel={
        `Liniendiagramm des Spannungsindex über die Spieltage, von ${number(usable[0].value, 1)} `
        + `auf ${number(usable[usable.length - 1].value, 1)}. Der tiefste mögliche Wert ist ${number(floor, 1)}.`
      }
      width={w}
      height={h}
      table={{
        columns: ["Spieltag", "effektive Zahl der Bewerber"],
        rows: usable.map((p) => [p.matchday === 0 ? "vor dem 1." : `${p.matchday}.`, number(p.value, 2)]),
      }}
    >
      {tickValues(maxY).map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{number(v, 0)}</text>
        </g>
      ))}
      <line x1={pad.l} y1={y(floor)} x2={w - pad.r} y2={y(floor)} stroke="var(--text-muted)" strokeDasharray="4 3" strokeWidth="1.5" />
      <text x={pad.l + 6} y={y(floor) - 6} className="axis-label">
        Minimum {number(floor, 1)} — vollständig entschieden
      </text>
      <path
        d={usable.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.matchday).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text x={w - pad.r} y={h - 8} textAnchor="end" className="axis-label">Spieltag</text>
    </Chart>
  );
}

/**
 * The frozen/live comparison (§0, V1.2).
 *
 * Per matchday and club: the frozen probability, the live one, and the gap. The
 * gap is labelled „zusätzliche Veränderung bei aktuellen Ratings" — deliberately
 * neither „Aufwertungseffekt" nor anything else that names a cause.
 */
function FrozenVsLive({ timeline, timelineLive, target, nameOf }) {
  const livePoints = timelineLive?.points ?? [];
  if (!livePoints.length || !target) return null;

  const frozenByMatchday = new Map((timeline?.points ?? []).map((p) => [p.matchday, p]));
  const rows = [];
  for (const lp of livePoints) {
    const fp = frozenByMatchday.get(lp.matchday);
    if (!fp) continue;
    const liveProbs = lp.probabilities?.[target.id] ?? {};
    const frozenProbs = fp.probabilities?.[target.id] ?? {};
    for (const clubId of Object.keys(liveProbs)) {
      rows.push({
        matchday: lp.matchday,
        clubId,
        frozen: frozenProbs[clubId] ?? 0,
        live: liveProbs[clubId] ?? 0,
      });
    }
  }
  if (!rows.length) return null;

  // The latest common matchday, and the clubs where the two curves differ most.
  const latest = Math.max(...rows.map((r) => r.matchday));
  const atLatest = rows
    .filter((r) => r.matchday === latest)
    .map((r) => ({ ...r, gap: r.live - r.frozen }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 8);

  return (
    <Card
      title={`${target.label}: eingefroren gegen aktuelle Ratings`}
      caption={
        `Stand nach dem ${latest}. Spieltag. Links „${CURVE_LABEL.frozen}“, rechts dieselbe Rechnung `
        + `mit den Ratings, die damals galten; die dritte Spalte ist die „${CURVE_LABEL.live}“. `
        + "Das ist eine beschreibende Gegenüberstellung, keine Zerlegung in Ursachen. Zwischen den "
        + "beiden Rechnungen unterscheidet sich mehr als nur das Rating — die eingefrorene Kurve "
        + "trägt dieselben Ergebnisse, dieselbe Tabelle und dieselbe verbleibende Unsicherheit, aber "
        + "der Unterschied lässt sich daraus nicht einer einzelnen Ursache zuschreiben."
        + (timelineLive.gaps?.length
          ? ` Für ${timelineLive.gaps.length} Spieltag(e) liegt kein archiviertes Rating vor; sie fehlen hier, statt geschätzt zu werden.`
          : "")
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Klub</th>
              <th scope="col">eingefroren</th>
              <th scope="col">aktuelle Ratings</th>
              <th scope="col">Unterschied</th>
            </tr>
          </thead>
          <tbody>
            {atLatest.map((r) => (
              <tr key={r.clubId}>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td>{percent(r.frozen, 1)}</td>
                <td>{percent(r.live, 1)}</td>
                <td>{r.gap >= 0 ? "+" : ""}{number(r.gap * 100, 1)} Pp.</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
