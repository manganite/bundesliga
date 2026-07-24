import { zoneColor } from "../lib/zones.js";

// ============================================================================
//  A direct-duel marker (§PRESETS §3): a compact chip naming the target, over
//  the shared duelTargetsByFixture source. Colour (the zone token) is never the
//  sole signal — the chip text carries the meaning; `title` names all targets
//  when there is more than one.
// ============================================================================

/** „Abstiegsduell" / „Titelduell" / „Duell um Platz 1–4". */
export function duelChipLabel(targetId, label) {
  if (targetId === "abstieg") return "Abstiegsduell";
  if (targetId === "meister") return "Titelduell";
  if (targetId === "aufstieg") return "Aufstiegsduell";
  return `Duell um ${label}`;
}

export default function DuelChip({ targets }) {
  if (!targets?.length) return null;
  const top = targets[0];
  const all = targets.map((t) => duelChipLabel(t.target, t.label)).join(" · ");
  return (
    <span className="duel-chip" style={{ borderColor: zoneColor(top.target) }} title={all}>
      <span className="zone-dot" style={{ background: zoneColor(top.target) }} aria-hidden="true" />
      {duelChipLabel(top.target, top.label)}
    </span>
  );
}

/** The left-stripe accent colour for a duel row — the top target's zone. */
export const duelStripeColor = (targets) => (targets?.length ? zoneColor(targets[0].target) : undefined);
