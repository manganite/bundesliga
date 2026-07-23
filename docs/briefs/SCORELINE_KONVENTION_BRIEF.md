# Brief — Wahrscheinlichstes Ergebnis: Konvention „innerhalb der Tendenz"

**Small, one PR. The standing „no engine change" clause is lifted for exactly
ONE pure, display-serving engine helper defined in §1 — nothing else. No
simulation semantics change, no pipeline change, no artefact change.**

## Problem

The fixture state line shows the favourite tendency next to the *global*
modal scoreline: „Heimsieg 57 %, wahrscheinlichstes Ergebnis 1:1". Both
numbers are correct, together they read as a contradiction. Cause: draws
bundle their probability onto few scorelines (mostly 1:1), wins spread theirs
over many (1:0, 2:0, 2:1 …). User decision: display the most likely scoreline
**within the favourite tendency**.

## 1 · Engine helper (the one permitted addition)

A pure function on the existing scoreline matrix, e.g.
`favouriteScoreline(matrix)` → `{ tendency, pTendency, scoreline,
pScoreline }`:

- `tendency` = argmax of the three region masses; `scoreline` = argmax over
  the cells of **that region only**.
- **Ties (both levels) resolve by the engine's canonical scoreline ordering**
  — first in the ordering wins. No new convention; the ordering already
  exists and is protocol-stamped.
- Unit tests include a fixture where global modal ≠ conditional modal (the
  „Heimsieg 57 %, global 1:1, bedingt 2:1"-case) and a tie case.

## 2 · Consumers

- `FixturePrediction` (the shared component — What-if „Simuliert" state and
  Methodik Schritt 2) displays the conditional scoreline. Wording unchanged:
  „Heimsieg 57 %, wahrscheinlichstes Ergebnis 2:1".
- The „Festsetzen"-prefill uses the **same** conditional scoreline — the
  anchor the user sees is the anchor they edit.
- Because it is one component and one helper, no second display path may
  exist; the existing single-component render test extends to assert the
  conditional value.

## 3 · Methodik, Schritt 2 — Ergänzung (wörtlich)

Nach dem Satz „Ein Favorit gewinnt darum nicht jedes Spiel …" und vor „So
sieht die Vorhersage …" einfügen:

> Eine Eigenheit dabei: Das wahrscheinlichste Einzelergebnis ist oft ein
> Remis wie das 1:1 — selbst wenn ein Sieg die wahrscheinlichere Tendenz ist.
> Siege verteilen ihre Wahrscheinlichkeit auf viele mögliche Ergebnisse
> (1:0, 2:0, 2:1 …), Remis bündeln sie auf wenige. Angezeigt wird deshalb
> überall das wahrscheinlichste Ergebnis innerhalb der wahrscheinlichsten
> Tendenz.

Kein weiterer Text; die Passage erklärt zugleich, warum die Anzeige so
definiert ist — der Verweis auf das Was-wäre-wenn darunter bleibt unverändert
und stimmt jetzt auch inhaltlich mit ihm überein.

## 4 · Abnahme

- `favouriteScoreline` getestet inkl. Divergenz- und Tie-Fall; kanonische
  Ordnung als Tie-Break nachgewiesen.
- Anzeige und Prefill nutzen die bedingte Konvention über die eine
  Komponente; ein Rendertest fixiert den Divergenzfall (Tendenz Sieg,
  angezeigtes Ergebnis kein Remis).
- Methodik-Ergänzung wörtlich übernommen; der bestehende
  Wortlaut-Verankerungstest wird um sie erweitert.
- Sonst keine Text-, Engine- oder Verhaltensänderung; CLAUDE.md-Kette und
  Zustand nach stehender Regel.
