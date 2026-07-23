import { integer } from "../lib/format.js";
import { DEFAULT_RUNS, MOBILE_RUNS } from "../hooks/useSimulation.js";

const CHOICES = [1000, MOBILE_RUNS, 10000, DEFAULT_RUNS, 50000];

/**
 * Simulation controls (§7 header).
 *
 * Changing the run count re-runs the simulation IN THE VIEW ONLY. Displayed
 * matchday deltas keep coming from the canonical pipeline artefact, so this
 * control can never silently change the basis of a historical difference (§3).
 * The note below says so rather than leaving the user to assume otherwise.
 */
export default function SimulationControls({ runs, onRuns, status, canonicalRuns, isCanonical }) {
  return (
    <div className="controls" role="group" aria-label="Simulation">
      <label htmlFor="runs">Simulationsläufe</label>
      <select
        id="runs"
        value={runs}
        onChange={(e) => onRuns(Number(e.target.value))}
        disabled={status === "running"}
      >
        {CHOICES.map((n) => (
          <option key={n} value={n}>
            {integer(n)}{n === canonicalRuns ? " (Standard)" : ""}
          </option>
        ))}
      </select>

      <span aria-live="polite" style={{ color: "var(--text-muted)" }}>
        {status === "running"
          ? "wird gerechnet …"
          : isCanonical
            ? `aus dem committeten Artefakt (${integer(canonicalRuns)} Läufe)`
            : `im Browser gerechnet (${integer(runs)} Läufe)`}
      </span>

      {!isCanonical ? (
        <span style={{ color: "var(--text-muted)" }}>
          Diese Zahl gilt nur für die Ansicht — Spieltagsdifferenzen bleiben auf dem Standardartefakt.
        </span>
      ) : null}
    </div>
  );
}
