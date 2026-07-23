# Entwicklung

Alles, was zum Mitbauen nötig ist. Die App selbst wird im
[README](../README.md) beschrieben.

Gebaut nach `BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md` und dem Erratum
`V5.7_ERRATUM_AND_V1_FIXES.md`. Wo die beiden sich widersprechen, gilt das
Erratum; wo eine verifizierte Primärquelle beiden widerspricht, gilt die Quelle
(siehe [verification/](verification/)).

## Aufbau

```
packages/engine/   Modell, Ligaregeln, Metriken — von beiden Apps konsumiert
pipeline/          Datenbeschaffung, Verifikation, vorberechnete Artefakte
apps/public/       App A (Vite, wird nach GitHub Pages deployt)
apps/kicktipp/     App B (eine HTML-Datei, gebündelt aus packages/engine)
data/              ausgelieferte Parameter und committete Daten
docs/verification/ die §11-Gates mit Quelle und Datum
```

`packages/engine` ist die einzige Quelle der Wahrheit für Modell, Ligaregeln und
jede Metrik. Keine der Apps implementiert davon etwas neu.

## Befehle

```bash
npm install
npm test                       # Engine-, Pipeline- und App-B-Tests, offline
npm run test:engine            # nur die Engine
npm run gate:clubelo           # Abdeckungsprüfung gegen die Live-API
npm run pipeline               # ein Pipeline-Lauf gegen die Live-Quellen

npm run dev   --workspace @bundesliga/app     # App A lokal
npm run build --workspace @bundesliga/app     # App A bauen
npm run build:kicktipp                        # App B -> apps/kicktipp/dist/kicktipp.html
```

Einzelne Tests:

```bash
node --test packages/engine/tests/ranking.test.mjs
node --test --test-name-pattern="floor" "packages/engine/tests/**/*.test.mjs"
```

Die Tests laufen offline gegen committete Fixtures
(`packages/engine/tests/fixtures/`, 22 echte Saisons beider Ligen). Weder
Entwicklung noch Tests laufen gegen die Live-API.

## Zustand

| Baustein | Zustand |
|---|---|
| Verifikationen vor dem Bau | 5 von 7 Gates geschlossen |
| `packages/engine` — RNG, Inverse-CDF-Sampling | ✅ mit Tests |
| `packages/engine` — Poisson + Dixon-Coles | ✅ mit Tests |
| `packages/engine` — DFL-Ranker | ✅ mit Tests, gegen 22 echte Saisons |
| `packages/engine` — Metriken | ✅ mit Tests |
| `packages/engine` — Monte-Carlo, CRN, Batch-SE(Δ) | ✅ mit Tests |
| `data/season-params.json` (Track C pooled) | ✅ ausgeliefert |
| `pipeline` — Klub-Mapping fail closed | ✅ mit Gate-Skript |
| `pipeline` — Datenbeschaffung, Snapshots, Provenance | ✅ mit Tests |
| `pipeline` — vorberechnete Artefakte | ✅ |
| Daten- und Deploy-Workflow | ✅ |
| App A — fünf Seiten (V1-Umfang) | ✅ |
| App B — eine selbstständige HTML-Datei | ✅ mit Tests |
| Refit als zwei Prozesse, Toleranzen ex ante | ✅ mit Tests |
| V1.1 (2. Bundesliga, Relegation) / V1.2 / V2 | ⏳ offen |

Gemessener Durchsatz der Saisonsimulation (306 Spiele, 18 Klubs, ein Kern):
**≈ 1 300 Läufe/s** — 20 000 Läufe in gut 15 s, 5 000 in 3,4 s. Das kanonische
20 000-Lauf-Artefakt entsteht deshalb in der Pipeline; im Browser läuft die
Simulation im Web Worker, mit 5 000 als mobiler Voreinstellung.

## Verifikationen vor dem Bau

§11 des Briefs macht diese Prüfungen zur Vorbedingung. Ergebnisse mit Quelle und
Datum in [verification/](verification/). Zwei Befunde haben den Bau verändert:

1. **Brief §6 gab die Tiebreak-Reihenfolge falsch wieder.** Die DFL-Spielordnung
   kennt keine Stufe „Punkte im direkten Vergleich", und die In-Saison-Regeln
   (nur die ersten beiden Kriterien vor dem Rückspiel, geteilte Tabellenplätze,
   kein Entscheidungsspiel während der Saison) fehlten im Brief ganz. Der Ranker
   folgt der Primärquelle — [Details](verification/dfl-spielordnung.md). Das
   Erratum v5.7 Part 1.1 hat das in die Spezifikation zurückgeführt.
2. **clubelo hat aktuell eine Abdeckungslücke** für vier von 36 Klubs. Die
   Pipeline verweigert deshalb korrekt den Commit —
   [Details](verification/clubelo.md).

Ein Gate ist noch offen und blockiert nur V2: ob sich die Tiebreak-Reihenfolge
innerhalb des Fensters ab 1995/96 geändert hat.

## Datenpipeline

Ein geplanter Workflow ist der einzige Datenpfad. Die App holt nichts live nach;
committete Dateien sind die einzige Quelle.

Die Pipeline schreibt **nichts**, solange eine Prüfung scheitert. Solange die
clubelo-Lücke besteht, endet `npm run pipeline` deshalb mit Exit-Code 1 und
unverändertem `data/` — das ist das vorgesehene Verhalten, kein Defekt.

Eine abgeschlossene Saison lässt sich vollständig neu aufbauen; der geplante
Workflow übergibt diese Flags nie:

```bash
node pipeline/src/cli.mjs --data-dir data --season 2025 --as-of 2026-06-01
```

**Wo das Rating-Archiv liegt, ist Konfiguration.** clubelo veröffentlicht keine
Lizenz; die Antwort des Betreibers entscheidet, ob das Archiv im öffentlichen
Repo bleibt. Voreinstellung ist `data/ratings/`, überschreibbar über
`BUNDESLIGA_RATINGS_DIR`. Ein Umzug ist damit eine Konfigurationsänderung plus
ein Migrations-Commit, nie ein Refactoring.

### Artefakte vergleichen

Nach jeder Änderung, die die Zufallsströme verschiebt — vor allem einem Bump von
`SIMULATION_PROTOCOL_VERSION` — prüft dieses Skript, ob der Unterschied
Stichprobenstreuung ist oder eine Verhaltensänderung:

```bash
node pipeline/src/compareArtefacts.mjs <alteSeasonsDir> <neueSeasonsDir>
```

Es prüft zweierlei: ob die z-Verteilung wie N(0,1) aussieht (fängt einen kleinen
systematischen Versatz über viele Ziele, den keine punktweise Schranke sieht) und
ob eine einzelne Abweichung die multiplizitätskorrigierte Schranke reißt (fängt
den Ausreißer, den die Verteilung wegmittelt). Beide Schwellen stehen im Skript
und wurden vorab festgelegt.

## Geheimnisse

Erlaubt sind ausschließlich:

- `GITHUB_TOKEN` — von den Workflows selbst gestellt.
- `LAB_REPO_TOKEN` — fein granuliert, nur Lesezugriff auf `contents` von
  `manganite/football-model-lab`, ausschließlich von `refit.yml` benutzt.

Sollte die clubelo-Antwort ein privates Datenrepo erzwingen, kommt ein auf dieses
Repo beschränkter Deploy-Key hinzu. Sonst nichts.

## Jährliche Checkliste

Vor jeder Saison:

- Europapokalplätze der kommenden Saison prüfen und die Saisonkonfiguration
  stempeln.
- Auf Regeländerungen prüfen (Auf-/Abstieg, Relegation, Tiebreak-Reihenfolge).
- Den Refit-Pull-Request prüfen. Der Sommerlauf committet nie direkt; er öffnet
  einen PR mit Monitoring-Bericht und neuen Produktionsparametern.

### Refit — was der Workflow braucht

Die Fit-Prozedur liegt in `football-model-lab` und wird hier bewusst **nicht**
nachgebaut: eine zweite Implementierung würde die ganze Herkunftskette wertlos
machen. Der Workflow checkt das Lab am gepinnten Commit aus und braucht dafür:

- das Secret `LAB_REPO_TOKEN`. Fehlt es, bricht der Lauf mit klarer Meldung ab,
  statt irgendetwas zu rechnen, das wie ein Fit aussieht.
- im Lab ein Skript `scripts/run-refit.mjs`, das die in
  `pipeline/src/refit/cli.mjs` dokumentierte JSON-Datei erzeugt.

Beides existiert im Lab noch nicht — das ist die offene Gegenstelle dieses
Bausteins.

Die Reproduktionsschranken für die Prozess-A-Ausnahme stehen in
`data/refit-tolerances.json`. Sie sind vorab festgelegt; sie nach Sicht eines
Ergebnisses zu ändern, ist genau das, was der Brief ausschließt.
