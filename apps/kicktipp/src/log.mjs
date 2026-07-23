// ============================================================================
//  Logging (§9).
//
//  „Logging of quotas, odds, tips and outcomes needs EXPORT/IMPORT and a SCHEMA
//   VERSION; localStorage alone is lost on a browser change."
//
//  So localStorage is a convenience, not the store of record. The export is the
//  store of record, and it carries a version so a future reader knows what it is
//  looking at.
// ============================================================================

export const LOG_SCHEMA_VERSION = 1;
const STORAGE_KEY = "bundesliga.kicktipp.log.v1";

export class LogError extends Error {}

const emptyLog = () => ({ schemaVersion: LOG_SCHEMA_VERSION, entries: [] });

export function loadLog(storage = globalThis.localStorage) {
  if (!storage) return emptyLog();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyLog();
    return normalise(JSON.parse(raw));
  } catch {
    // A corrupt local store must not take the app down; the export is the copy
    // that matters.
    return emptyLog();
  }
}

export function saveLog(log, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false; // quota exceeded or storage disabled — not fatal
  }
}

/**
 * Record one tipped fixture. Quotas and odds are stored as they stood AT TIP
 * TIME: the quota is recalculated after every submission, so a later reading
 * would not be the number the decision was made on.
 */
export function addEntry(log, entry) {
  const required = ["tippedAt", "home", "away", "odds", "quotas", "tip"];
  for (const key of required) {
    if (entry[key] === undefined) throw new LogError(`entry is missing ${key}`);
  }
  return {
    ...log,
    entries: [
      ...log.entries,
      {
        tippedAt: entry.tippedAt,
        home: entry.home,
        away: entry.away,
        odds: { ...entry.odds },
        quotas: { ...entry.quotas },
        tip: { home: entry.tip.home, away: entry.tip.away },
        expectedPoints: entry.expectedPoints ?? null,
        favouriteTip: entry.favouriteTip ? { home: entry.favouriteTip.home, away: entry.favouriteTip.away } : null,
        // Filled in later, once the match has been played.
        result: entry.result ?? null,
        points: entry.points ?? null,
      },
    ],
  };
}

/** Attach an actual result to a logged entry. */
export function recordResult(log, index, result, points) {
  if (!log.entries[index]) throw new LogError(`no entry at index ${index}`);
  const entries = log.entries.slice();
  entries[index] = { ...entries[index], result: { ...result }, points };
  return { ...log, entries };
}

export function exportLog(log) {
  return `${JSON.stringify({ ...log, schemaVersion: LOG_SCHEMA_VERSION, exportedAt: new Date().toISOString() }, null, 2)}\n`;
}

/**
 * Import an export. A file without a recognised schema version is REJECTED
 * rather than guessed at — silently reinterpreting old data is how logs quietly
 * become wrong.
 */
export function importLog(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new LogError(`kein gültiges JSON: ${e.message}`);
  }
  if (parsed.schemaVersion !== LOG_SCHEMA_VERSION) {
    throw new LogError(
      `Schema-Version ${JSON.stringify(parsed.schemaVersion)} wird nicht unterstützt `
        + `(erwartet ${LOG_SCHEMA_VERSION})`,
    );
  }
  return normalise(parsed);
}

function normalise(parsed) {
  if (!Array.isArray(parsed.entries)) throw new LogError("entries fehlt oder ist keine Liste");
  return { schemaVersion: LOG_SCHEMA_VERSION, entries: parsed.entries };
}

/**
 * Realised figures, once the log has data.
 *
 * Deliberately returns nulls rather than a placeholder when nothing has been
 * scored yet: §9 forbids printing a fixed hit-rate figure, and the „~55 % →
 * ~47 %" numbers from design came from a single nine-match matchday and must
 * never be shown as fact.
 */
export function realisedFigures(log) {
  const scored = log.entries.filter((e) => e.result && e.points !== null);
  if (!scored.length) return { matches: 0, hitRate: null, meanPoints: null };
  const tendency = (h, a) => (h > a ? "H" : h < a ? "A" : "D");
  const hits = scored.filter(
    (e) => tendency(e.tip.home, e.tip.away) === tendency(e.result.home, e.result.away),
  ).length;
  return {
    matches: scored.length,
    hitRate: hits / scored.length,
    meanPoints: scored.reduce((a, e) => a + e.points, 0) / scored.length,
  };
}
