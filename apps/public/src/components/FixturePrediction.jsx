import { percent } from "../lib/format.js";

// ============================================================================
//  One fixture's model prediction — favourite tendency with its probability and
//  the modal scoreline. Both come from predictMatch (via predictFixture); this
//  component adds no number of its own.
//
//  ONE component, two call sites (§SZENARIEN_UX acceptance): the what-if
//  „Simuliert" state and Methodik step 2 („Ein Spiel") must show the same thing
//  the same way, so they render this — never a second copy.
// ============================================================================

const TENDENCY_LABEL = { homeWin: "Heimsieg", draw: "Unentschieden", awayWin: "Auswärtssieg" };

/** The favourite tendency (argmax) and the modal scoreline, from a prediction. */
export function favouriteOf(prediction) {
  const t = prediction.tendency;
  const [key] = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
  const [h, a] = prediction.mostLikely.score;
  return { tendency: key, label: TENDENCY_LABEL[key], probability: t[key], modal: [h, a] };
}

/** „Simuliert — Heimsieg 48 %, wahrscheinlichstes Ergebnis 2:1" */
export default function FixturePrediction({ prediction, prefix = "Simuliert" }) {
  if (!prediction) return <span className="axis-label">simuliert</span>;
  const fav = favouriteOf(prediction);
  return (
    <span className="fixture-prediction">
      {prefix ? <strong>{prefix}</strong> : null}
      {prefix ? " — " : null}
      {fav.label} {percent(fav.probability, 0)}, wahrscheinlichstes Ergebnis {fav.modal[0]}:{fav.modal[1]}
    </span>
  );
}
