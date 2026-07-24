// ============================================================================
//  Zone colour mapping (§FARBEN_UNTERTITEL §2.3).
//
//  The Bundesliga counterpart to podium colours: which target zone a table row
//  falls into, mapped to a CSS custom property. The mapping is by target id from
//  the league configuration, so BL2 works by the same rule. Colour is only ever
//  an ACCENT beside the text label — never the sole carrier of meaning.
//
//  The zone of a RANK is the tightest matching zone: rank 1 is „Meister" even
//  though it is also inside „Platz 1–4". Targets are „finish in [from, to]".
// ============================================================================

/** target id -> CSS variable that carries its accent colour. */
export const ZONE_TOKEN = {
  meister: "--zone-champion",
  aufstieg: "--zone-champion",
  platz1bis4: "--zone-europe",
  platz5bis6: "--zone-conference",
  relegationsplatz: "--zone-relegation",
  relegationsplatzAufstieg: "--zone-promotion-playoff",
  relegationsplatzAbstieg: "--zone-relegation",
  abstieg: "--zone-drop",
};

/** The CSS var() string for a target, or null if it has no accent. */
export function zoneColor(targetId) {
  return ZONE_TOKEN[targetId] ? `var(${ZONE_TOKEN[targetId]})` : null;
}

/**
 * The tightest zone a rank falls into, given the league's targets. Returns the
 * target (with its label and colour) or null. „Tightest" = smallest span, so a
 * rank inside several nested zones takes the most specific.
 */
export function zoneOfRank(rank, targets) {
  const matching = targets
    .filter((t) => ZONE_TOKEN[t.id] && rank >= t.from && rank <= t.to)
    .sort((a, b) => (a.to - a.from) - (b.to - b.from));
  const t = matching[0];
  return t ? { id: t.id, label: t.label, color: zoneColor(t.id) } : null;
}
