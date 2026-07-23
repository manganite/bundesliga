# Fit-Extraktion — Inventar und Reproduktionsnachweis

Die Produktions-Fitprozedur ist aus dem privaten `football-model-lab` in dieses
Monorepo gezogen worden (`packages/fit`). Das Lab bleibt privat und bleibt das
Forschungsheft; was hier liegt, ist ausschließlich, was die beiden Refit-Prozesse
aus §5.5 brauchen.

Damit entfällt der Grund für `LAB_REPO_TOKEN`: der jährliche Refit ist aus einem
einzigen, öffentlichen Repo reproduzierbar.

## Phase 0 — Inventar

Erhoben am 2026-07-23 im Arbeitsverzeichnis des Labs. Das Lab wurde dabei
ausschließlich gelesen.

### 1. Der Codepfad, der die ausgelieferten Parameter erzeugt hat

| | |
|---|---|
| Lab-Commit | `bb000fbbd945dbc19c41baf093d607065747af92` (entspricht dem HEAD des Arbeitsverzeichnisses) |
| Einstiegspunkt | `scripts/run-track-c-part0.mjs`, Zeile 120 |
| Aufruf | `fitV1Fast(all, { keys: MODEL_KEYS, start: { HOME_ADV: 80 } })` |
| Kern | `src/trackc.mjs` — `fitV1Fast`, `fastV1NLL`, `poissonAt`, `SPEC`, `defaults`, `effectiveParams` |
| Optimierer | **lokales** `nelderMead` in `src/trackc.mjs` (Zeile 181), *nicht* das exportierte aus `src/optimize.mjs` |
| Sprache | Node, ESM, ohne Laufzeitabhängigkeiten |
| Artefakt | `report/params-track-c-part0.json`, Feld `fullFit` |

`MODEL_KEYS` sind die acht Schlüssel, die auch `season-params.json` unter
`provenance.hyperparameters.fitKeys` verzeichnet. Die drei BL2-Deltas darin sind
nicht gesetzt, sondern im selben Lauf über held-out-Evidenz ausgewählt worden
(`keptDeltas`); die Auswahl ist im Artefakt festgehalten und wird hier als
Hyperparameter übernommen, nicht neu getroffen.

**Entscheidungstor: Node → dies ist ein Verschieben, kein Port.** Erwartung
deshalb: **bitgleiche** Reproduktion.

### 2. Die Trainingsdaten

| | |
|---|---|
| Herkunft | `data/track-c/{bl1,bl2}-{2011…2025}.json`, 30 Dateien |
| Umfang | 9180 Spiele, beide Ligen, 15 Saisons (2011/12–2025/26) |
| Ergebnisse | OpenLigaDB, ODbL — committebar |
| Elo je Spiel | `eloHome` / `eloAway`, „valid the day BEFORE kickoff" |
| Ghost-Flag | `isGhost`, Fenster 2020-03-11 bis 2021-06-01 |
| höchste Torzahl einer Seite | 9 |

Die Ergebnisse liegen committet unter `data/training/results/`, jede Datei mit
ihrem `source`-Feld. Die Elo-Werte folgen der Standortregel des Archivs
(`BUNDESLIGA_RATINGS_DIR`, Voreinstellung `data/ratings/`) und sind **seit dem
2026-07-23 ebenfalls committet**, unter `data/ratings/training-elo/` mit
clubelo-Attribution im `source`-Feld — der Betreiber hat die öffentliche
Weitergabe abgeleiteter Ratings erlaubt (docs/verification/clubelo.md). Damit
läuft das Reproduktionstor in CI statt nur lokal. Die Standortregel bleibt
trotzdem: sie ist unabhängig von der Lizenzfrage gute Hygiene.

**Null clubelo-Anfragen in der gesamten Extraktion.** Die Daten stammen
vollständig aus dem lokalen Bestand des Labs.

### 3. Teilt die Rolling-Origin-Auswertung den Codepfad?

Ja. `timeForward()` in `run-track-c-part0.mjs` ruft dasselbe `fitV1Fast` auf und
misst mit `fastV1Metrics` auf der jeweils zurückgehaltenen Saison. Prozess B
braucht also keinen zweiten Fitpfad — `packages/fit` bedient beide Prozesse aus
derselben Funktion.

### Was ausdrücklich im Lab bleibt

Forschungsphasen und Notebooks, jede Tipp- und Kicktipp-Analyse, die
Negativbefund-Erkundungen, und alles, was die beiden Refit-Prozesse nicht
brauchen. Künftige *Forschung* passiert im Lab; eine Prozeduränderung, die
ausgeliefert werden soll, wird zu einer Prozess-B-Änderung **in diesem** Repo.

## Eine Abweichung, die benannt gehört

Die Engine normalisiert die Scoreline-Verteilung über ein **abgeschnittenes**
Gitter (`MAX_GOALS`), weil sie ein endliches Gitter zum Ziehen braucht. Die
Likelihood braucht das nicht und darf es auch nicht: über ein abgeschnittenes
Gitter zu normalisieren hieße, auf „höchstens zehn Tore" zu konditionieren.

`packages/fit` verwendet deshalb die **analytische, nicht abgeschnittene**
Normalisierung — dieselbe, die die ausgelieferten Parameter erzeugt hat. Die
Poisson-Rekursion und der Dixon-Coles-Term kommen dabei aus `packages/engine`;
es gibt weiterhin nur eine Implementierung der Mathematik. Ein Test hält
Vektor- und Einzelwertform der Poisson-Rekursion bitgleich, damit sie nicht
auseinanderdriften können.

## Phase 3 — Reproduktionsnachweis

Siehe `packages/fit/tests/reproduction.test.mjs`. Der Vergleich läuft gegen die
vorab festgelegten Toleranzklassen aus `data/refit-tolerances.json` — dieselben
Schranken, die die Prozess-A-Ausnahme benutzt, hier für genau den Zweck, für den
sie gedacht sind.

Ergebnis siehe unten; die Tabelle wird vom Test erzeugt und hier eingetragen.

### Ergebnis — Lauf vom 2026-07-23

| Parameter | Toleranzklasse | ausgeliefert | reproduziert | bitgleich |
|---|---|---|---|---|
| `BASE_TOTAL` | goalRate | 3.0279202615048213 | 3.0279202615048213 | ✅ |
| `ELO_PER_GOAL` | eloScale | 213.02074119618948 | 213.02074119618948 | ✅ |
| `RHO` | correlation | -0.10088172337685239 | -0.10088172337685239 | ✅ |
| `HOME_ADV` | eloOffset | 68.91055375224373 | 68.91055375224373 | ✅ |
| `HOME_ADV_GHOST` | eloOffset | -24.246303437330884 | -24.246303437330884 | ✅ |
| `HOME_ADV_BL2` | eloOffset | -4.055085798617771 | -4.055085798617771 | ✅ |
| `BASE_TOTAL_BL2` | goalRate | -0.22048618532780445 | -0.22048618532780445 | ✅ |
| `ELO_PER_GOAL_BL2` | eloScale | 14.6473666962757 | 14.6473666962757 | ✅ |

**8 von 8 bitgleich.** Die Toleranzklassen wurden nicht gebraucht — bei einem
Verschieben innerhalb derselben Sprache ist alles andere ein Fehler, kein Spielraum.

Der Weg dorthin ist festgehalten, weil er nicht selbstverständlich war: der erste
Extraktionsversuch war in **keinem** Parameter bitgleich, mit Abweichungen bis 2,2 in
`HOME_ADV_GHOST`. Ursache war allein die **Summationsreihenfolge** der Likelihood — bei
identischen Parametern unterscheiden sich die beiden Reihenfolgen um 1,2e-14, und
Nelder-Mead ist ableitungsfrei genug, das bis in die zweite Stelle zu verstärken. Die
Reihenfolge ist deshalb Teil der Prozedur und in `packages/fit/src/data.mjs` festgenagelt.

