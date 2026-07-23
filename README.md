# Bundesliga-Simulator + Kicktipp-Optimierer

Monorepo für zwei Anwendungen, gebaut nach `BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md`.

- **App A** — Bundesliga-Simulator, statische GitHub-Pages-Seite, Monte-Carlo im
  Web Worker, kein Backend. Enthält nichts Kicktipp-, Quoten- oder
  Tipp-Bezogenes.
- **App B** — Kicktipp-Optimierer, eine einzelne selbstständige HTML-Datei. Nicht
  deployt, nicht verlinkt. Der Quelltext liegt im öffentlichen Repo; „privat"
  heißt hier ausschließlich „nicht als Website veröffentlicht".

Beide konsumieren `packages/engine` — die einzige Quelle der Wahrheit für Modell,
Ligaregeln und jede Metrik. Keine der Apps implementiert davon irgendetwas neu.

## Stand

Im Bau. Fertig und getestet:

| Baustein | Zustand |
|---|---|
| §11-Verifikationen vor dem Bau | 5 von 7 Gates geschlossen, siehe unten |
| `packages/engine` — RNG, Inverse-CDF-Sampling (§3) | ✅ mit Tests |
| `packages/engine` — Poisson + Dixon-Coles (§2) | ✅ mit Tests |
| `packages/engine` — DFL-Ranker (§6) | ✅ mit Tests, gegen 22 echte Saisons |
| `packages/engine` — §4-Metriken | ✅ mit Tests |
| `packages/engine` — Monte-Carlo, CRN, Batch-SE(Δ) (§3) | ✅ mit Tests |
| `data/season-params.json` (Track C pooled) | ✅ ausgeliefert |
| `pipeline` — Klub-Mapping fail closed (§5.2) | ✅ mit Gate-Skript |
| `pipeline` — Datenbeschaffung, Snapshots, Provenance (§5.1/§5.3) | ✅ mit Tests |
| `pipeline` — vorberechnete Artefakte (Outlook, eingefrorene Timeline) | ✅ |
| Daten- und Deploy-Workflow | ✅ |
| App A — Übersicht, Tabelle & Prognose, Spieltage, Teams, Verlauf | ✅ V1-Umfang |
| App B, Refit-Workflow, V1.1/V1.2/V2 | ⏳ offen |

Gemessener Durchsatz der Saisonsimulation (306 Spiele, 18 Klubs, ein Kern):
**≈ 1 300 Läufe/s** — 20 000 Läufe in gut 15 s, 5 000 in 3,4 s. Das kanonische
20 000-Lauf-Artefakt gehört damit wie in §3 vorgesehen in die Pipeline; im
Browser läuft die Simulation im Web Worker, mit 5 000 als mobiler Voreinstellung.

## Verifikationen vor dem Bau

§11 macht diese Prüfungen zur Vorbedingung. Ergebnisse mit Quelle und Datum in
[docs/verification/](docs/verification/). Zwei Befunde haben den Bau verändert:

1. **Brief §6 gab die Tiebreak-Reihenfolge falsch wieder.** Die DFL-Spielordnung
   kennt keine Stufe „Punkte im direkten Vergleich", und die In-Saison-Regeln
   (nur die ersten beiden Kriterien vor dem Rückspiel, geteilte Tabellenplätze,
   kein Entscheidungsspiel während der Saison) fehlten im Brief ganz. Der Ranker
   folgt der Primärquelle — [Details](docs/verification/dfl-spielordnung.md).
2. **clubelo hat aktuell eine Abdeckungslücke** für vier von 36 Klubs. Die
   Pipeline verweigert deshalb korrekt den Commit — [Details](docs/verification/clubelo.md).

Ein Gate ist noch offen und blockiert nur V2: ob sich die Tiebreak-Reihenfolge
innerhalb des Fensters ab 1995/96 geändert hat.

## Aufbau

```
packages/engine/   Modell, Ligaregeln, Metriken — von beiden Apps konsumiert
pipeline/          Datenbeschaffung, Verifikation, vorberechnete Artefakte
apps/public/       App A (Vite, wird nach GitHub Pages deployt)
apps/kicktipp/     App B (eine HTML-Datei, gebündelt aus packages/engine)
data/              ausgelieferte Parameter und committete Daten
docs/verification/ die §11-Gates mit Quelle und Datum
```

## Entwickeln

```
npm install
npm test                      # Engine- und Pipeline-Tests, offline
npm run gate:clubelo          # §11-Abdeckungsprüfung gegen die Live-API
npm run pipeline              # ein Pipeline-Lauf gegen die Live-Quellen
npm run dev --workspace @bundesliga/app     # App A lokal
npm run build --workspace @bundesliga/app   # App A bauen
```

Die Pipeline schreibt **nichts**, solange eine Prüfung scheitert. Solange die
clubelo-Lücke besteht, endet `npm run pipeline` deshalb mit Exit-Code 1 und
einem unveränderten `data/` — das ist das vorgesehene Verhalten, kein Defekt.

Die Tests laufen offline gegen committete Fixtures
(`packages/engine/tests/fixtures/`, 22 echte Saisons beider Ligen).

## Datenquellen und Lizenz

- **Ergebnisse und Spielpläne:** [OpenLigaDB](https://www.openligadb.de/), unter
  der [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  Kein API-Schlüssel nötig. Die aus OpenLigaDB abgeleiteten, hier committeten
  Datendateien stehen ihrerseits unter der ODbL; jede Datei nennt ihre Quelle im
  `source`-Feld.
- **Ratings:** [clubelo.com](http://clubelo.com/).
- **Modellparameter:** `football-model-lab`, Track C, pooled BL1+BL2-Fit über 15
  Saisons. Herkunft (Commit, Fitdatum, Fenster) steht in
  `data/season-params.json`.

Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings. Die
Modellparameter bleiben während der Saison unverändert.

## Jährliche Checkliste

Vor jeder Saison:

- Europapokalplätze der kommenden Saison prüfen und die Saisonkonfiguration
  stempeln.
- Auf Regeländerungen prüfen (Auf-/Abstieg, Relegation, Tiebreak-Reihenfolge).
- Den Refit-Pull-Request prüfen. Der Sommerlauf committet nie direkt; er öffnet
  einen PR mit Monitoring-Bericht und neuen Produktionsparametern (§5.5).
