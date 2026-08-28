import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import ChartLegend from "../components/ChartLegend.jsx";
import ChartTooltip from "../components/ChartTooltip.jsx";
import { HalfSeasonMarker, HitAreas, useActivePoint, YAxisTitle } from "../components/ChartInteractive.jsx";
import { targetList, scoredMatches, matchdaySurprises, verlaufSeries, pausedTimelineMatchday } from "../lib/season.js";
import { halfBoundary } from "../lib/halbserie.js";
import DreiAnker from "../components/DreiAnker.jsx";
import { retrospectiveLabel } from "../lib/archive.js";
import { effectiveContenders } from "../../../../packages/engine/src/metrics.mjs";
import { percent, number, pp } from "../lib/format.js";

// The curve palette lives in CSS tokens (§FARBEN: no per-case hex in a
// component). SVG stroke accepts var() directly.
const SERIES_COLOURS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
// The chart shows at most this many clubs — one per series colour.
const MAX_SERIES = SERIES_COLOURS.length;

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
  const { timeline, timelineLive, leagueConfig, nameOf, leagueLabel, isArchive, params, season, prematch, league } = ctx;
  const targets = targetList(leagueConfig);
  const [targetId, setTargetId] = useState(targets[0]?.id);

  const target = targets.find((t) => t.id === targetId) ?? targets[0];
  // §2 — the half-season ruler, from the season configuration. One value feeds
  // all three charts on this page so they cannot disagree about where the
  // season halves.
  const boundary = halfBoundary(leagueConfig);

  // The two biggest surprises of each matchday, for the multi-club tooltip
  // (§CHART_AUSBAU §1): a played fixture whose actual tendency the pre-match
  // model rated least likely. Empty until a matchday is played.
  const surprisesByMatchday = useMemo(
    () => matchdaySurprises(scoredMatches(season, prematch, params, league), nameOf),
    [season, prematch, params, league, nameOf],
  );

  // A broad „safe" target (Klassenerhalt spans most of the table): reaching it
  // is the norm, so the story is the RISK of missing it. For such a target the
  // series are selected and ranked by the COMPLEMENT (1 − P) — otherwise every
  // shown club sits flat near 100 % (Bayern was never in danger, nobody cares).
  const clubCount = season?.clubs?.length ?? 18;
  const invert = target ? target.places > clubCount / 2 : false;

  // The matchday holding the curve back, or null (§AUDIT_FAMILIE §2).
  const pausedMatchday = useMemo(() => pausedTimelineMatchday(season?.fixtures), [season]);

  const selectionNote = invert
    ? `Höchstens acht Klubs, gereiht nach dem höchsten Risiko im Verlauf, „${target?.label}“ zu verpassen — zuerst die, die dabei mindestens einmal ≥ 2 % erreichten, danach bei Bedarf aufgefüllt.`
    : "Höchstens acht Klubs, gereiht nach ihrem höchsten Wert im Verlauf — zuerst die, die dabei mindestens einmal über 2 % kamen, danach bei Bedarf aufgefüllt.";

  const series = useMemo(() => {
    if (!timeline?.points?.length || !target) return null;
    return verlaufSeries(timeline.points, target.id, invert, MAX_SERIES);
  }, [timeline, target, invert]);

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

      {/* §V2b.1 §3/§4.2: every historical timeline is labelled a retrospective
          replay with today's parameters, not the forecast made at the time. */}
      {isArchive ? (
        <p className="banner" role="note">{retrospectiveLabel(params?.procedureVersion)}</p>
      ) : null}

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
            ? <MultiLine series={series} nameOf={nameOf} targetLabel={target.label} label={timeline.label?.label} surprisesByMatchday={surprisesByMatchday} selectionNote={selectionNote} boundary={boundary} />
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
          <TensionLine series={tensionSeries} floor={target?.places ?? 1} targetLabel={target?.label} boundary={boundary} />
        </Card>

        <FrozenVsLive
          timeline={timeline}
          timelineLive={timelineLive}
          target={target}
          nameOf={nameOf}
        />

        {/* §HALBSERIEN §6 — the three anchors. Gated on a COMPLETE season, so it
            is there for every archive season at once and appears in the live one
            with the final matchday. It uses this page's target selector rather
            than growing a second one. */}
        <DreiAnker ctx={ctx} target={target} />

        <Card title="Was diese Kurven sind">
          <p className="caption" style={{ margin: 0 }}>
            Die Grundkurve verwendet durchgehend dieselben Ratings vom Saisonstart
            {timeline.frozenEffectiveAt ? ` (Stand ${timeline.frozenEffectiveAt})` : ""}; nur die Menge der
            bekannten Ergebnisse wächst. Sie enthält also keine Rating-Aktualisierungen.
            {timelineLive?.points?.length
              ? " Die Gegenüberstellung darunter zeigt daneben die Kurve mit den Ratings, die zum jeweiligen Zeitpunkt tatsächlich galten."
              : " Die Gegenüberstellung mit aktuellen Ratings erscheint, sobald archivierte Ratings für gespielte Spieltage vorliegen."}
            {" "}Jeder Punkt beruht auf {number(timeline.runs, 0)} Simulationsläufen.
            {/* §AUDIT_FAMILIE §2: renders only in the case it describes (§7). A
                point needs ALL matches up to its matchday, so a postponement
                pauses the curve — that has to be said, not left to guessing. */}
            {pausedMatchday
              ? ` Spieltag ${pausedMatchday} ist noch unvollständig (Nachholspiel) — weitere Punkte`
                + " erscheinen, sobald alle Spiele bis dahin gespielt sind."
              : ""}
          </p>
        </Card>
      </div>
    </>
  );
}

// §CHART_AUSBAU §1: the multi-club curve gains a legend (full club names, click
// to highlight one series and dim the rest), and a per-matchday tooltip that
// lists every visible club with its value and Δpp plus the two biggest
// surprises of that matchday. The old truncated end-labels are gone — the
// legend carries the full names now.
function MultiLine({ series, nameOf, targetLabel, label, surprisesByMatchday, selectionNote, boundary }) {
  const w = 760;
  const h = 320;
  const pad = { l: 52, r: 14, t: 12, b: 32 };
  const points = series[0].points;
  const maxX = Math.max(...points.map((p) => p.matchday), 1);
  const x = (md) => pad.l + (md / maxX) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - v * (h - pad.t - pad.b);
  const colourOf = (i) => SERIES_COLOURS[i % SERIES_COLOURS.length];

  const [highlight, setHighlight] = useState(null);
  const { active, setActive, onKeyDown } = useActivePoint(points.length);
  const centers = points.map((p) => x(p.matchday));

  const last = series.map((s) => ({ clubId: s.clubId, value: s.points[s.points.length - 1].value }));
  const legendItems = series.map((s, i) => ({ key: s.clubId, label: nameOf(s.clubId), color: colourOf(i) }));

  const tooltipRows = (i) => series
    .map((s, k) => ({
      label: nameOf(s.clubId),
      raw: s.points[i].value,
      value: percent(s.points[i].value),
      delta: i > 0 ? s.points[i].value - s.points[i - 1].value : undefined,
      color: colourOf(k),
    }))
    .filter((r) => r.raw >= 0.005 || highlight === null)
    .sort((a, b) => b.raw - a.raw);

  return (
    <>
      <Chart
        title={`${targetLabel} je Spieltag`}
        ariaLabel={
          `Liniendiagramm mit ${series.length} Klubs: Wahrscheinlichkeit für „${targetLabel}“ über die Spieltage. `
          + `Am Ende führt ${nameOf(last.slice().sort((a, b) => b.value - a.value)[0].clubId)} `
          + `mit ${percent(Math.max(...last.map((l) => l.value)))}.`
        }
        width={w}
        height={h}
        caption={`${label ?? "Eingefrorene Saisonstart-Stärke"}. ${selectionNote}`}
        table={{
          columns: ["Klub", ...points.map((p) => (p.matchday === 0 ? "vor dem 1." : `${p.matchday}.`))],
          rows: series.map((s) => [nameOf(s.clubId), ...s.points.map((p) => percent(p.value))]),
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{Math.round(v * 100)} %</text>
          </g>
        ))}
        <YAxisTitle label="%" top={pad.t} bottom={h - pad.b} />
        <HalfSeasonMarker boundary={boundary} maxMatchday={maxX} x={x} top={pad.t} bottom={h - pad.b} />
        {series.map((s, i) => {
          const dimmed = highlight != null && highlight !== s.clubId;
          return (
            <path
              key={s.clubId}
              d={s.points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.matchday).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={colourOf(i)}
              strokeWidth={highlight === s.clubId ? 3.2 : 2.2}
              strokeLinejoin="round"
              opacity={dimmed ? 0.18 : 1}
            />
          );
        })}
        {active != null ? (
          <line x1={centers[active]} y1={pad.t} x2={centers[active]} y2={h - pad.b} className="grid-line" />
        ) : null}
        <text x={w - pad.r} y={h - 8} textAnchor="end" className="axis-label">Spieltag</text>
        <HitAreas
          centers={centers}
          top={pad.t}
          bottom={h - pad.b}
          active={active}
          setActive={setActive}
          onKeyDown={onKeyDown}
          labelAt={(i) => `${points[i].matchday === 0 ? "vor dem 1. Spieltag" : `${points[i].matchday}. Spieltag`}: ${tooltipRows(i).slice(0, 4).map((r) => `${r.label} ${r.value}`).join(", ")}`}
        />
        {active != null ? (
          <ChartTooltip
            x={centers[active]}
            width={w}
            boxWidth={240}
            title={points[active].matchday === 0 ? "vor dem 1. Spieltag" : `${points[active].matchday}. Spieltag`}
            rows={tooltipRows(active)}
            context={surprisesByMatchday.get(points[active].matchday) ?? []}
          />
        ) : null}
      </Chart>
      <ChartLegend items={legendItems} onToggle={setHighlight} active={highlight} />
    </>
  );
}

/** Whole-number ticks that stay readable however tall the axis is. */
function tickValues(maxY) {
  const step = maxY <= 4 ? 1 : maxY <= 10 ? 2 : 5;
  const out = [];
  for (let v = 0; v <= maxY; v += step) out.push(v);
  return out;
}

function TensionLine({ series, floor, targetLabel, boundary }) {
  const usable = series.filter((p) => p.value != null);
  if (!usable.length) return <Empty>Kein Verlauf verfügbar.</Empty>;

  const w = 760;
  const h = 220;
  const pad = { l: 52, r: 12, t: 12, b: 32 };
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
      <YAxisTitle label="Bewerber" top={pad.t} bottom={h - pad.b} />
      <HalfSeasonMarker boundary={boundary} maxMatchday={maxX} x={x} top={pad.t} bottom={h - pad.b} label={false} />
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
      caption={`Stand nach dem ${latest}. Spieltag. Links „${CURVE_LABEL.frozen}“, rechts dieselbe Rechnung mit den Ratings, die damals galten; die dritte Spalte ist die „${CURVE_LABEL.live}“.`}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Das ist eine beschreibende Gegenüberstellung, keine Zerlegung in Ursachen. Zwischen den
          beiden Rechnungen unterscheidet sich mehr als nur das Rating — die eingefrorene Kurve
          trägt dieselben Ergebnisse, dieselbe Tabelle und dieselbe verbleibende Unsicherheit, aber
          der Unterschied lässt sich daraus nicht einer einzelnen Ursache zuschreiben.
          {timelineLive.gaps?.length
            ? ` Für ${timelineLive.gaps.length} Spieltag(e) liegt kein archiviertes Rating vor; sie fehlen hier, statt geschätzt zu werden.`
            : ""}
        </p>
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
                <td>{pp(r.gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
