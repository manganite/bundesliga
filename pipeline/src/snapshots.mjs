// ============================================================================
//  Rating snapshot archive (§5.1, §5.3).
//
//  ARCHIVED FROM V1 DAY ONE, even though nothing consumes them until V1.2.
//  Without that the live-rating timeline can never be built retroactively —
//  this is the one piece of V1 that cannot be added later.
//
//  Contract:
//   - A raw snapshot carries `observedAt` (when we fetched it) and
//     `effectiveAt` (the date the rating refers to) — and NO global `phase`
//     field. A rating between two matches is simultaneously post-match for the
//     previous fixture and pre-match for the next, so a single phase label is
//     ambiguous. Which snapshot counted as pre-match for which fixture is
//     recorded per fixture instead, in preMatch.mjs.
//   - Snapshots are IMMUTABLE. A correction is a new snapshot, appended; an
//     existing file is never edited and never moved.
//   - Appending is IDEMPOTENT and ATOMIC: re-running the job must not duplicate
//     or corrupt history, and a crash mid-write must not leave a torn file.
//
//  Layout — one file per snapshot, plus an index:
//    data/ratings/snapshots/<snapshotId>.json
//    data/ratings/index.json
//  One-file-per-snapshot makes immutability structural: an append only ever
//  creates a new path, so existing paths keep working by construction.
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const INDEX = "index.json";
const SNAPDIR = "snapshots";

/**
 * WHERE THE ARCHIVE LIVES IS CONFIGURATION, NOT AN ASSUMPTION.
 *
 * clubelo publishes no licence. A permission request is with the operator; the
 * answer decides whether this archive stays in the public repository or moves to
 * a private one. That move must be a CONFIGURATION CHANGE plus a migration
 * commit — never a refactoring under time pressure.
 *
 * So every path is derived from a base directory that callers pass in, and the
 * path semantics (index file, snapshot naming, idempotent atomic append) are
 * location-independent. `resolveArchiveBase` is the single place that decides
 * the default, and an operator can override it without touching code.
 */
export const DEFAULT_ARCHIVE_SUBDIR = "ratings";
export const ARCHIVE_BASE_ENV = "BUNDESLIGA_RATINGS_DIR";

export function resolveArchiveBase(dataDir, { env = process.env, override = null } = {}) {
  if (override) return path.resolve(override);
  const fromEnv = env?.[ARCHIVE_BASE_ENV];
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(dataDir, DEFAULT_ARCHIVE_SUBDIR);
}

/**
 * A storage handle bound to one base directory. Everything the pipeline does to
 * the archive goes through this, so pointing it elsewhere is a one-line change.
 */
export function createSnapshotStore(baseDir) {
  return {
    baseDir,
    readIndex: () => readIndex(baseDir),
    append: (snapshot) => appendSnapshot(baseDir, snapshot),
    read: (snapshotId) => readSnapshot(baseDir, snapshotId),
    findPreMatch: (index, kickoff) => findPreMatchSnapshot(index, kickoff),
  };
}

export class SnapshotError extends Error {}

/** Stable content hash over the ratings themselves — key order cannot matter. */
export function contentHash(ratings) {
  const canonical = Object.keys(ratings)
    .sort()
    .map((k) => `${k}=${ratings[k]}`)
    .join(";");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Write a file atomically: temp file in the same directory, then rename. */
async function writeAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, contents);
  try {
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export async function readIndex(dir) {
  try {
    const raw = await fs.readFile(path.join(dir, INDEX), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.snapshots)) throw new SnapshotError("index.json has no snapshots array");
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return { schemaVersion: 1, snapshots: [] };
    throw e;
  }
}

/**
 * Append a snapshot.
 *
 * Idempotent on (source, effectiveAt, contentHash): re-running the job with
 * unchanged data appends nothing and reports `appended: false`. The same
 * `effectiveAt` with DIFFERENT content is a correction and IS appended as a new
 * immutable snapshot — the earlier one keeps its path and its content.
 *
 * @param {string} dir       data/ratings
 * @param {object} snapshot  { source, observedAt, effectiveAt, ratings }
 */
export async function appendSnapshot(dir, { source, observedAt, effectiveAt, ratings, note }) {
  if (!source) throw new SnapshotError("source is required");
  if (!observedAt) throw new SnapshotError("observedAt is required");
  if (!effectiveAt) throw new SnapshotError("effectiveAt is required");
  if (!ratings || Object.keys(ratings).length === 0) throw new SnapshotError("ratings are required");

  const hash = contentHash(ratings);
  const index = await readIndex(dir);

  const duplicate = index.snapshots.find(
    (s) => s.source === source && s.effectiveAt === effectiveAt && s.contentHash === hash,
  );
  if (duplicate) return { snapshotId: duplicate.snapshotId, appended: false, reason: "identical snapshot already archived" };

  const supersedes = index.snapshots.filter((s) => s.source === source && s.effectiveAt === effectiveAt);
  const snapshotId = `${source}-${effectiveAt}-${hash}`;

  const record = {
    snapshotId,
    schemaVersion: 1,
    source,
    // The two timestamps that replace a global phase field.
    observedAt,
    effectiveAt,
    contentHash: hash,
    // A correction never edits its predecessor; it names it.
    correctionOf: supersedes.length ? supersedes[supersedes.length - 1].snapshotId : null,
    note: note ?? null,
    ratings,
  };

  await fs.mkdir(path.join(dir, SNAPDIR), { recursive: true });
  const file = path.join(dir, SNAPDIR, `${snapshotId}.json`);

  // Immutability is structural, but assert it anyway: a path that already
  // exists must never be overwritten.
  try {
    await fs.access(file);
    return { snapshotId, appended: false, reason: "snapshot file already exists" };
  } catch { /* expected: new snapshot */ }

  await writeAtomic(file, `${JSON.stringify(record, null, 2)}\n`);

  index.snapshots.push({
    snapshotId,
    source,
    observedAt,
    effectiveAt,
    contentHash: hash,
    correctionOf: record.correctionOf,
    clubs: Object.keys(ratings).length,
  });
  index.snapshots.sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.observedAt.localeCompare(b.observedAt));
  await writeAtomic(path.join(dir, INDEX), `${JSON.stringify(index, null, 2)}\n`);

  return { snapshotId, appended: true, correctionOf: record.correctionOf };
}

export async function readSnapshot(dir, snapshotId) {
  const raw = await fs.readFile(path.join(dir, SNAPDIR, `${snapshotId}.json`), "utf8");
  return JSON.parse(raw);
}

/**
 * Of two index entries carrying the SAME `effectiveAt`, does `candidate`
 * supersede `incumbent`?
 *
 * One implementation for all three lookups below, because a supersession rule
 * that exists in three copies is a rule that will drift.
 *
 * Three steps, and the middle one was learned the hard way:
 *
 *  1. Later `observedAt` wins. The archive is append-only and a correction
 *     names its predecessor rather than editing it — corrections are meant to
 *     be used.
 *
 *  2. Same `observedAt` → MORE CLUBS wins. Two entries written by the SAME run
 *     share an instant to the millisecond, and step 1 cannot separate them; it
 *     silently fell through to array order, which is insertion order. On
 *     2026-08-08 that handed three fixtures a five-club backfill snapshot while
 *     a 34-club one for the same date sat beside it
 *     (docs/verification/pipeline-ausfallverhalten.md §3). A selection rule
 *     whose answer depends on insertion order is not deterministic, which is
 *     reason enough to fix it even now that the root cause is gone.
 *
 *  3. Still tied → higher `snapshotId`. Arbitrary but STABLE: two entries with
 *     the same instant and the same club count still differ in content, and the
 *     lookup must return the same one every time it is asked.
 */
export function supersedes(candidate, incumbent) {
  if (candidate.observedAt !== incumbent.observedAt) {
    return candidate.observedAt > incumbent.observedAt;
  }
  const a = candidate.clubs ?? 0;
  const b = incumbent.clubs ?? 0;
  if (a !== b) return a > b;
  return candidate.snapshotId > incumbent.snapshotId;
}

/**
 * The snapshot that was valid before `kickoff` — the latest one whose
 * `effectiveAt` is strictly earlier than the kickoff DATE.
 *
 * Strictly earlier, not "on or before": a rating stamped with the day of the
 * match may already incorporate that match's result, and a value fetched after
 * kickoff must never become a pre-match rating. Where only a same-day or later
 * snapshot exists, this returns null and the caller records the gap rather than
 * substituting something plausible.
 *
 * Ties on `effectiveAt` are broken by `supersedes` — see there.
 */
export function findPreMatchSnapshot(index, kickoffIso) {
  const kickoffDate = String(kickoffIso).slice(0, 10);
  let best = null;
  for (const s of index.snapshots) {
    if (s.effectiveAt >= kickoffDate) continue;
    if (!best
      || s.effectiveAt > best.effectiveAt
      || (s.effectiveAt === best.effectiveAt && supersedes(s, best))) {
      best = s;
    }
  }
  return best;
}

/**
 * The snapshot that IS the state of a given day, or null.
 *
 * Not `snapshots.find(...)`: the archive is append-only and a correction never
 * edits its predecessor, it names it. Several entries can therefore carry the
 * same `effectiveAt`, and which one counts is decided by `supersedes` — the one
 * shared rule, so the three lookups here cannot drift apart.
 */
export function findSnapshotOn(index, date, source = "clubelo") {
  let best = null;
  for (const s of index.snapshots) {
    if (s.source !== source || s.effectiveAt !== date) continue;
    if (!best || supersedes(s, best)) best = s;
  }
  return best;
}

/**
 * The state AS OF a date: the newest snapshot effective on or before it.
 *
 * Three lookups now live side by side, and the difference between them is the
 * whole point:
 *   findPreMatchSnapshot — STRICTLY before a kickoff. Conservative on purpose,
 *                          so a result can never leak into its own forecast.
 *   findSnapshotOn       — exactly that day, latest observation wins.
 *   findSnapshotAsOf     — on or before that day. What the live-rating timeline
 *                          asks for: the state once a matchday is complete.
 */
export function findSnapshotAsOf(index, date, source = "clubelo") {
  let best = null;
  for (const s of index.snapshots) {
    if (s.source !== source || s.effectiveAt > date) continue;
    if (!best
      || s.effectiveAt > best.effectiveAt
      || (s.effectiveAt === best.effectiveAt && supersedes(s, best))) {
      best = s;
    }
  }
  return best;
}

/**
 * The newest archived snapshot that covers EVERY club in `clubIds` — the rating
 * basis a run falls back on when clubelo is unreachable (Brief 34).
 *
 * „Complete" rather than „newest" is the whole point, and the reason is already
 * paid for: on 2026-08-11 a five-club snapshot displaced a thirty-four-club one
 * of the same day and three matches were forecast on it
 * (docs/verification/pipeline-ausfallverhalten.md §3). An old complete snapshot
 * is a defensible basis; a fresh partial one is not, because the clubs it omits
 * would have no rating at all.
 *
 * Snapshots are read newest-first and the first complete one wins, so a healthy
 * archive costs exactly one read. Returns null when none covers every club —
 * the caller must fail rather than forecast on a hole.
 *
 * @param {object} index
 * @param {string[]} clubIds        every club that needs a rating
 * @param {(id:string)=>Promise<object>} loadSnapshot
 * @param {string} [source]
 */
export async function newestCompleteSnapshot(index, clubIds, loadSnapshot, source = "clubelo") {
  // A TOTAL ORDER, expressed through `supersedes` itself rather than a second
  // copy of its precedence (Codex-Befund zu PR #51). The first draft returned 1
  // whenever `supersedes(a, b)` was false — including for the reverse pair, so
  // it claimed both „a after b" and „b after a" and left the order up to the
  // sort implementation. For two genuinely equivalent snapshots that is
  // harmless in effect and still a determinism defect in kind: a selection rule
  // whose answer depends on input order is exactly what this repository refuses
  // (see the `supersedes` note in CLAUDE.md).
  const candidates = index.snapshots
    .filter((s) => s.source === source)
    .sort((a, b) => {
      if (a.effectiveAt !== b.effectiveAt) return a.effectiveAt < b.effectiveAt ? 1 : -1;
      if (supersedes(a, b)) return -1;
      if (supersedes(b, a)) return 1;
      return 0; // identical on every key precedence knows about
    });
  for (const meta of candidates) {
    const snap = await loadSnapshot(meta.snapshotId);
    if (clubIds.every((id) => snap.ratings[id] !== undefined)) {
      return { ...snap, snapshotId: meta.snapshotId, effectiveAt: meta.effectiveAt };
    }
  }
  return null;
}

/**
 * Was this snapshot observed before the kickoff it is being used for?
 *
 * This is what separates the two provenance values of §5.3, and it is a
 * property of the DATA, not of when the pipeline happens to run:
 *   contemporaneous — observedAt is before kickoff. Only these may ever be
 *                     presented as „die damalige Prognose".
 *   backfilled      — reconstructed afterwards from clubelo's published
 *                     history. Valid for retrospective calculation only.
 */
export function provenanceFor(snapshotMeta, kickoffIso) {
  return snapshotMeta.observedAt < kickoffIso ? "contemporaneous" : "backfilled";
}

export const SNAPSHOT_DIR = SNAPDIR;
export const INDEX_FILE = INDEX;
