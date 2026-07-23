import { useEffect, useMemo, useState } from "react";
import {
  formatDataUpdatedAt, stalenessWarning, seasonPhase, SEASON_PHASE_LABEL, configStampWarning,
  carriedRatings, carriedRatingSummary,
} from "../../../packages/engine/src/dataState.mjs";
import { LEAGUES, leagueLabel, leagueSeasonLabel } from "../../../packages/engine/src/leagues.mjs";
import { loadManifest, loadLeagueSeason, clubIndex, currentMatchday, toEngineFixtures } from "./lib/data.js";
import { useSimulation, DEFAULT_RUNS } from "./hooks/useSimulation.js";
import SimulationControls from "./components/SimulationControls.jsx";
import { seasonLabel } from "./lib/format.js";
import Uebersicht from "./pages/Uebersicht.jsx";
import TabelleUndPrognose from "./pages/TabelleUndPrognose.jsx";
import Spieltage from "./pages/Spieltage.jsx";
import Teams from "./pages/Teams.jsx";
import Verlauf from "./pages/Verlauf.jsx";

const REPO = "https://github.com/manganite/bundesliga";

const PAGES = [
  { id: "uebersicht", label: "Übersicht", Component: Uebersicht },
  { id: "tabelle", label: "Tabelle & Prognose", Component: TabelleUndPrognose },
  { id: "spieltage", label: "Spieltage", Component: Spieltage },
  { id: "teams", label: "Teams", Component: Teams },
  { id: "verlauf", label: "Verlauf", Component: Verlauf },
];

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, "") || PAGES[0].id);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#\/?/, "") || PAGES[0].id);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const route = useHashRoute();
  const [state, setState] = useState({ status: "loading" });
  // Which league is shown is USER STATE, not part of the route's page id, and it
  // survives a page change. It starts at the Bundesliga because that is what an
  // unqualified visit means, never because the manifest happens to list it first.
  const [league, setLeague] = useState("bl1");
  const [available, setAvailable] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const manifest = await loadManifest();
        if (!manifest.seasons.length) {
          if (!cancelled) setState({ status: "empty" });
          return;
        }
        // The newest committed season. Never hardcoded (§5.5).
        const newest = manifest.seasons[manifest.seasons.length - 1];
        const present = LEAGUES.filter((l) => newest.leagues.some((e) => e.league === l));
        // A league with no committed data is not offered at all. Offering a
        // toggle that leads to an empty page would be worse than no toggle.
        const chosen = present.includes(league) ? league : present[0];
        if (!chosen) { if (!cancelled) setState({ status: "empty" }); return; }
        if (!cancelled) setAvailable(present);
        if (chosen !== league) { if (!cancelled) setLeague(chosen); return; }
        // Deliberately NOT keeping the previous league's data on screen while the
        // new one loads: that would put one league's numbers under the other
        // league's heading for a moment, which is the exact confusion the
        // labelling exists to prevent.
        if (!cancelled) setState({ status: "loading" });
        const data = await loadLeagueSeason(newest.season, chosen);
        if (!cancelled) setState({ status: "ready", seasonId: newest.season, league: chosen, data });
      } catch (e) {
        if (!cancelled) setState({ status: "error", error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [league]);

  const shellProps = { league, available, onLeague: setLeague };

  if (state.status === "loading") {
    return <Shell {...shellProps}><p className="empty">Daten werden geladen …</p></Shell>;
  }
  if (state.status === "error") {
    return (
      <Shell {...shellProps}>
        <p className="empty">Die Daten konnten nicht geladen werden: {state.error}</p>
      </Shell>
    );
  }
  if (state.status === "empty") {
    return (
      <Shell {...shellProps}>
        <p className="empty">
          Es liegen noch keine committeten Daten vor. Die App zeigt ausschließlich Daten, die
          die Pipeline geprüft und committet hat — sie holt selbst nichts live nach.
        </p>
      </Shell>
    );
  }

  return (
    <Ready
      route={route}
      {...state}
      available={available}
      onLeague={setLeague}
    />
  );
}

function Shell({ children, league, available = [], onLeague }) {
  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <header className="site-header">
        <div className="inner">
          <h1>Bundesliga-Simulator</h1>
          <p className="tagline">
            Wie die Saison ausgehen könnte — als Wahrscheinlichkeiten, mit offengelegtem Modell.
          </p>
          {/* The switch stays put while the new league loads, so the control the
              reader just used never disappears under them. */}
          {onLeague ? <LeagueSwitch league={league} available={available} onLeague={onLeague} /> : null}
        </div>
      </header>
      <div className="shell"><main id="inhalt">{children}</main></div>
    </>
  );
}

/**
 * The league toggle.
 *
 * Rendered as radio buttons, not as a dropdown or a pair of links: the two
 * options and which one is active are then both visible at a glance, and the
 * active one is exposed to assistive technology without extra wiring. It sits
 * directly above the heading it changes.
 */
function LeagueSwitch({ league, available, onLeague }) {
  if (available.length < 2) return null;
  return (
    <fieldset className="league-switch">
      <legend className="visually-hidden">Liga wählen</legend>
      {available.map((l) => (
        <label key={l} className={l === league ? "is-active" : undefined}>
          <input
            type="radio"
            name="liga"
            value={l}
            checked={l === league}
            onChange={() => onLeague(l)}
          />
          <span>{leagueLabel(l)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Ready({ route, seasonId, league, data, available, onLeague }) {
  const { meta, config, season, outlook, timeline, prematch, params, playoff } = data;

  const clubs = useMemo(() => clubIndex(season), [season]);
  const nameOf = useMemo(() => (id) => clubs.get(id)?.name ?? id, [clubs]);
  const leagueConfig = config.leagues[league];

  // --- simulation controls -------------------------------------------------
  // The committed artefact is the default and the canonical basis. A user who
  // changes the run count gets their own run, in a worker, for the view only.
  const canonicalRuns = outlook?.runs ?? DEFAULT_RUNS;
  const [runs, setRuns] = useState(canonicalRuns);
  const isCanonical = runs === canonicalRuns;

  const simRequest = useMemo(() => {
    if (isCanonical || !outlook?.ratings || !params?.params) return null;
    return {
      seasonId: `${season.season}-${league}`,
      league,
      clubs: season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] })),
      fixtures: toEngineFixtures(season.fixtures),
      params: params.params,
      targets: leagueConfig.targets,
      runs,
      batches: 20,
      rules: {
        pointsForWin: leagueConfig.pointsForWin,
        pointsForDraw: leagueConfig.pointsForDraw,
        criteria: leagueConfig.tiebreakCriteria,
      },
    };
  }, [isCanonical, outlook, params, season, league, leagueConfig, runs]);

  const sim = useSimulation(simRequest);
  // The artefact every page reads. Falls back to the canonical one while a
  // user-requested run is still going, so nothing ever renders empty.
  const activeOutlook = (!isCanonical && sim.status === "done" && sim.result)
    ? { ...sim.result, ratings: outlook.ratings }
    : outlook;

  const matchday = currentMatchday(season.fixtures);
  const phase = seasonPhase(season.fixtures);
  const phaseLabel = SEASON_PHASE_LABEL[phase];
  const staleness = stalenessWarning(season.fixtures, new Date(), config.staleness?.graceHours ?? 6);
  const stampWarning = configStampWarning(config, season.season);
  // §8: a forecast partly built on stale inputs must say so. Self-clearing —
  // the line disappears the moment clubelo lists the clubs again.
  const carried = carriedRatings(activeOutlook);
  const carriedSummary = carriedRatingSummary(carried, nameOf);

  const active = PAGES.find((p) => p.id === route) ?? PAGES[0];
  const { Component } = active;

  // The heading a screenshot carries with it. The document title says it too,
  // because a browser tab and a bookmark are the two places where the toggle
  // state is otherwise invisible.
  const heading = leagueSeasonLabel(league, seasonLabel(season.season));
  useEffect(() => {
    document.title = `${heading} — Bundesliga-Simulator`;
  }, [heading]);

  const ctx = {
    seasonId, league, leagueLabel: leagueLabel(league), leagueConfig, config, season,
    outlook: activeOutlook, timeline, prematch, params, playoff,
    clubs, nameOf, matchday, phase, carried,
  };

  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>

      <header className="site-header">
        <div className="inner">
          <h1>Bundesliga-Simulator</h1>
          <p className="tagline">
            Wie die Saison ausgehen könnte — als Wahrscheinlichkeiten, mit offengelegtem Modell.
          </p>

          <LeagueSwitch league={league} available={available} onLeague={onLeague} />

          {/* Not one entry among many in the meta row: the league decides what
              every number below means, so it is the heading. */}
          <h2 className="league-heading">{heading}</h2>

          <div className="meta-row">
            <span>{phase === "preSeason" ? "vor dem 1. Spieltag" : `${matchday}. Spieltag`}</span>
            {/* §5.1: stated neutrally. The app derives NO workflow-health claim
                from this timestamp — an old value is normal in an international
                break and all off-season. */}
            <span>{formatDataUpdatedAt(meta?.dataUpdatedAt)}</span>
            <a href={REPO} rel="noreferrer">Quellcode und Methodik</a>
          </div>

          {phaseLabel ? <p className="banner">{phaseLabel}</p> : null}
          {staleness ? <p className="banner warn" role="status">{staleness.text}</p> : null}
          {stampWarning ? <p className="banner warn" role="alert">{stampWarning}</p> : null}
          {carriedSummary ? <p className="banner warn" role="status">{carriedSummary}</p> : null}

          <SimulationControls
            runs={runs}
            onRuns={setRuns}
            status={sim.status}
            canonicalRuns={canonicalRuns}
            isCanonical={isCanonical}
          />

          <nav className="tabs" aria-label="Seiten">
            {PAGES.map((p) => (
              <a
                key={p.id}
                href={`#/${p.id}`}
                aria-current={p.id === active.id ? "page" : undefined}
              >
                {p.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="shell">
        <main id="inhalt">
          <Component ctx={ctx} />
        </main>

        <footer className="footer">
          <p>
            Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings.
            Die Modellparameter bleiben während der Saison unverändert.
          </p>
          <p>
            Ergebnisse und Spielpläne von <a href="https://www.openligadb.de/" rel="noreferrer">OpenLigaDB</a>{" "}
            unter der <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noreferrer">ODbL 1.0</a>;
            Ratings von <a href="http://clubelo.com/" rel="noreferrer">clubelo.com</a>.
            {params?.provenance
              ? ` Modellparameter: ${params.procedureVersion}, gefittet am ${params.provenance.fitDate} über ${params.provenance.fitSeasons}.`
              : null}
          </p>
        </footer>
      </div>
    </>
  );
}
