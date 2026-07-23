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
 * The snapshot that was valid before `kickoff` — the latest one whose
 * `effectiveAt` is strictly earlier than the kickoff DATE.
 *
 * Strictly earlier, not "on or before": a rating stamped with the day of the
 * match may already incorporate that match's result, and a value fetched after
 * kickoff must never become a pre-match rating. Where only a same-day or later
 * snapshot exists, this returns null and the caller records the gap rather than
 * substituting something plausible.
 *
 * When several snapshots share an `effectiveAt` (a correction), the LATEST
 * observed one wins — corrections are meant to be used.
 */
export function findPreMatchSnapshot(index, kickoffIso) {
  const kickoffDate = String(kickoffIso).slice(0, 10);
  let best = null;
  for (const s of index.snapshots) {
    if (s.effectiveAt >= kickoffDate) continue;
    if (!best
      || s.effectiveAt > best.effectiveAt
      || (s.effectiveAt === best.effectiveAt && s.observedAt > best.observedAt)) {
      best = s;
    }
  }
  return best;
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
