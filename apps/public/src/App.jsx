import { useEffect, useMemo, useState } from "react";
import {
  formatDataUpdatedAt, stalenessWarning, seasonPhase, SEASON_PHASE_LABEL, configStampWarning,
  carriedRatings, carriedRatingSummary,
} from "../../../packages/engine/src/dataState.mjs";
import { LEAGUES, leagueLabel, leagueSeasonLabel } from "../../../packages/engine/src/leagues.mjs";
import { loadManifest, loadLeagueSeason, clubIndex, currentMatchday } from "./lib/data.js";
import { seasonLabel } from "./lib/format.js";
import Uebersicht from "./pages/Uebersicht.jsx";
import TabelleUndPrognose from "./pages/TabelleUndPrognose.jsx";
import Spieltage from "./pages/Spieltage.jsx";
import Teams from "./pages/Teams.jsx";
import Verlauf from "./pages/Verlauf.jsx";
import Modellguete from "./pages/Modellguete.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import Szenarien from "./pages/Szenarien.jsx";
import Methodik from "./pages/Methodik.jsx";

const REPO = "https://github.com/manganite/bundesliga";

const PAGES = [
  { id: "uebersicht", label: "Übersicht", Component: Uebersicht },
  { id: "tabelle", label: "Tabelle & Prognose", Component: TabelleUndPrognose },
  { id: "spieltage", label: "Spieltage", Component: Spieltage },
  { id: "teams", label: "Teams", Component: Teams },
  { id: "verlauf", label: "Verlauf", Component: Verlauf },
  { id: "modellguete", label: "Modellgüte", Component: Modellguete },
  { id: "szenarien", label: "Szenarien", Component: Szenarien },
  { id: "methodik", label: "Methodik", Component: Methodik },
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
  // The SEASON is the second global dimension (§V2b.1 §2). `null` follows the
  // newest committed season — the default an unqualified visit means; a chosen
  // value pins an archive season. Like the league, it is user state, survives a
  // page change, and decides what every number below means.
  const [season, setSeason] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [newestSeason, setNewestSeason] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const manifest = await loadManifest();
        if (!manifest.seasons.length) {
          if (!cancelled) setState({ status: "empty" });
          return;
        }
        // The newest committed season is the live one. Never hardcoded (§5.5).
        const newest = manifest.seasons[manifest.seasons.length - 1];
        const allSeasons = manifest.seasons.map((s) => s.season);
        const selectedSeason = season ?? newest.season;
        const entry = manifest.seasons.find((s) => s.season === selectedSeason) ?? newest;
        const present = LEAGUES.filter((l) => entry.leagues.some((e) => e.league === l));
        // A league with no committed data for this season is not offered at all.
        const chosen = present.includes(league) ? league : present[0];
        if (!chosen) { if (!cancelled) setState({ status: "empty" }); return; }
        if (!cancelled) { setAvailable(present); setSeasons(allSeasons); setNewestSeason(newest.season); }
        if (chosen !== league) { if (!cancelled) setLeague(chosen); return; }
        // Deliberately NOT keeping the previous data on screen while the new one
        // loads: that would put one season/league's numbers under the other's
        // heading for a moment, the exact confusion the labelling prevents.
        if (!cancelled) setState({ status: "loading" });
        const data = await loadLeagueSeason(selectedSeason, chosen);
        // An ARCHIVE season is any committed season that is not the live one.
        const isArchive = selectedSeason !== newest.season;
        if (!cancelled) setState({ status: "ready", seasonId: selectedSeason, league: chosen, data, isArchive });
      } catch (e) {
        // §Codex §4: a load failure is a FAILURE, not an empty data stand. The
        // detail goes to the console; the UI says so plainly.
        console.error("Datenladefehler:", e);
        if (!cancelled) setState({ status: "error", error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [league, season]);

  const shellProps = {
    league, available, onLeague: setLeague,
    seasons, season: season ?? newestSeason, newestSeason, onSeason: setSeason,
  };

  if (state.status === "loading") {
    return <Shell {...shellProps}><p className="empty">Daten werden geladen …</p></Shell>;
  }
  if (state.status === "error") {
    return (
      <Shell {...shellProps}>
        <p className="empty" role="alert">
          Die Daten konnten nicht geladen werden — das ist ein Fehler, kein leerer Datenstand.
          Neu laden hilft möglicherweise; sonst bitte später erneut versuchen.
        </p>
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
      seasons={seasons}
      season={season ?? newestSeason}
      newestSeason={newestSeason}
      onSeason={setSeason}
    />
  );
}

function Shell({ children, league, available = [], onLeague, seasons = [], season, newestSeason, onSeason }) {
  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <header className="site-header">
        <div className="inner">
          <h1>Bundesliga-Simulator</h1>
          <p className="tagline">
            Eine Monte-Carlo-Simulation der Bundesliga — rechnet nach jedem Spieltag mit den
            tatsächlichen Ergebnissen neu. Keine einmalige, starre Prognose.
          </p>
          {/* The switches stay put while the new data loads, so the control the
              reader just used never disappears under them. */}
          <div className="header-switches">
            {onSeason ? <SeasonSwitch seasons={seasons} season={season} newestSeason={newestSeason} onSeason={onSeason} /> : null}
            {onLeague ? <LeagueSwitch league={league} available={available} onLeague={onLeague} /> : null}
          </div>
        </div>
      </header>
      <div className="shell"><main id="inhalt">{children}</main></div>
    </>
  );
}

/**
 * The season selector — the second global dimension (§V2b.1 §2). A dropdown, not
 * radios: the window spans 16 seasons, far too many for a radio row. The default
 * is always the live season; an archive season is marked „· Archiv" so the reader
 * never mistakes a replay for the current forecast.
 */
export function SeasonSwitch({ seasons, season, newestSeason, onSeason }) {
  if (!seasons || seasons.length < 2) return null;
  const isArchive = season !== newestSeason;
  return (
    <span className={isArchive ? "season-switch is-archive" : "season-switch"}>
      <label>
        <span className="visually-hidden">Saison wählen</span>
        {/* Picking the live season sets `null`, not its year: that RESTORES the
            „follow the newest committed season" default, so the app auto-follows
            when a new season lands rather than staying pinned to today's year. */}
        <select value={season} onChange={(e) => { const y = Number(e.target.value); onSeason(y === newestSeason ? null : y); }}>
          {[...seasons].sort((a, b) => b - a).map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}{s === newestSeason ? "" : " · Archiv"}
            </option>
          ))}
        </select>
      </label>
      {isArchive ? <span className="archive-badge" title="Abgeschlossene Saison — Retrospektive">Archiv</span> : null}
    </span>
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

export function Ready({ route, seasonId, league, data, isArchive = false, available, onLeague, seasons, season: seasonSel, newestSeason, onSeason }) {
  const { meta, config, season, outlook, timeline, timelineLive, prematch, params, playoff, relegation } = data;

  const clubs = useMemo(() => clubIndex(season), [season]);
  const nameOf = useMemo(() => (id) => clubs.get(id)?.name ?? id, [clubs]);
  const leagueConfig = config.leagues[league];

  // Every page reads the ONE canonical 20 000-run artefact. The run-count
  // control was removed (§UEBERSICHT_HEADER_FOOTER §2.4): it was never used, and
  // „eine Simulation je Datenstand" reads more literally without it. The worker
  // survives only for the Szenarien page.
  const matchday = currentMatchday(season.fixtures);
  const phase = seasonPhase(season.fixtures);
  const phaseLabel = SEASON_PHASE_LABEL[phase];
  // §V2b.1 §2.3: an ARCHIVE season is a finished replay — the live-only elements
  // (results-overdue staleness, config-stamp mismatch, carry-forward, and the
  // „season starts soon" label) must NEVER render. They are all tied to „now" or
  // to the live data stand and would fire spuriously on a season from years ago.
  const staleness = isArchive ? null : stalenessWarning(season.fixtures, new Date(), config.staleness?.graceHours ?? 6);
  const stampWarning = isArchive ? null : configStampWarning(config, season.season);
  // §8: a forecast partly built on stale inputs must say so. Self-clearing —
  // the line disappears the moment clubelo lists the clubs again.
  const carried = isArchive ? [] : carriedRatings(outlook);
  const carriedSummary = isArchive ? null : carriedRatingSummary(carried, nameOf);

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
    outlook, timeline, timelineLive, prematch, params, playoff, relegation,
    clubs, nameOf, matchday, phase, carried, isArchive,
  };

  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>

      <header className="site-header">
        <div className="inner">
          <h1>Bundesliga-Simulator</h1>
          <p className="tagline">
            Eine Monte-Carlo-Simulation der Bundesliga — rechnet nach jedem Spieltag mit den
            tatsächlichen Ergebnissen neu. Keine einmalige, starre Prognose.
          </p>

          <div className="header-switches">
            <SeasonSwitch seasons={seasons} season={seasonSel} newestSeason={newestSeason} onSeason={onSeason} />
            <LeagueSwitch league={league} available={available} onLeague={onLeague} />
          </div>

          {/* Not one entry among many in the meta row: the season and league
              decide what every number below means, so they are the heading. */}
          <h2 className="league-heading">
            {heading}{isArchive ? <span className="archive-tag"> · Archiv</span> : null}
          </h2>

          <div className="meta-row">
            <span>{phase === "preSeason" ? "vor dem 1. Spieltag" : `${matchday}. Spieltag`}</span>
            {/* The global „Datenstand" describes the LIVE season only; for an
                archive it would be misleading, so it is replaced by the season's
                state. §5.1: stated neutrally, no workflow-health claim. */}
            <span>{isArchive ? "Abgeschlossene Saison" : formatDataUpdatedAt(meta?.dataUpdatedAt)}</span>
            <a href={REPO} rel="noreferrer">Quellcode und Methodik</a>
          </div>

          {phaseLabel ? <p className="banner">{phaseLabel}</p> : null}
          {staleness ? <p className="banner warn" role="status">{staleness.text}</p> : null}
          {stampWarning ? <p className="banner warn" role="alert">{stampWarning}</p> : null}
          {carriedSummary ? <p className="banner warn" role="status">{carriedSummary}</p> : null}

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
          {/* The page is REMOUNTED on any season/league change (§Codex §2):
              its local state (club, matchday, Verlauf target, Spiel-Zeugnis, and
              every scenario override) belongs to one data set and must not leak
              into another — a BL1 club does not exist in the BL2 picker, a 2014
              scenario has no meaning under 2026/27. Discarding is the honest
              semantics; switching back does not resurrect it. */}
          <Component key={`${seasonId}-${league}`} ctx={ctx} />
        </main>

        <SiteFooter version={__APP_VERSION__} buildStamp={__BUILD_STAMP__} />
      </div>
    </>
  );
}
