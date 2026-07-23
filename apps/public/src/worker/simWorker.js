// ============================================================================
//  Monte-Carlo in a Web Worker (§10) — the UI is never blocked.
//
//  The worker imports packages/engine directly. Neither app forks or
//  re-implements the model, the league rules or any metric (§10).
//
//  This recomputes the CURRENT VIEW only. Displayed matchday deltas always come
//  from the canonical pipeline artefact (20 000 runs); the user's run-count
//  control must never silently change the basis of a historical difference (§3).
// ============================================================================

import { simulateSeason } from "../../../../packages/engine/src/simulate.mjs";

self.onmessage = (event) => {
  const { id, payload } = event.data;
  try {
    const targets = {};
    for (const [name, t] of Object.entries(payload.targets)) {
      targets[name] = { places: t.places, positions: (r) => r >= t.from && r <= t.to };
    }
    const result = simulateSeason({ ...payload, targets });
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
