# Entwicklung

Alles, was zum Mitbauen nötig ist. Die App selbst wird im
[README](../README.md) beschrieben.

Gebaut nach einer Kette von Vorgaben, die in [briefs/](briefs/) liegen — mit
einem Index, der ihre Reihenfolge erklärt, denn aus den Dateinamen ist sie nicht
ablesbar. Die jeweils spätere schlägt die frühere; wo eine verifizierte
Primärquelle allen widerspricht, gilt die Quelle (siehe
[verification/](verification/)).

Die Briefe bleiben unverändert stehen — sie sind das Protokoll dessen, was wann
entschieden wurde. Was **operativ gilt**, steht hier. Zwei Punkte, die dadurch
inzwischen anders lauten als in v5.7:

- „gepinnter Lab-Commit" heißt jetzt: gepinnter Commit **dieses** Repos.
- Die Liste erlaubter Secrets ist auf `GITHUB_TOKEN` geschrumpft.

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
npm test                       # Engine-, Fit-, Pipeline- und App-Tests, offline
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

App A wird dabei **wirklich gerendert**: `apps/public/tests/harness/build.mjs`
lässt Vite die JSX-Dateien in ein SSR-Bündel bauen, das die Tests mit
`react-dom/server` rendern. Node kann JSX nicht direkt lesen, und das Projekt
bekommt dafür keinen eigenen Transpiler — die Toolchain der App macht die Arbeit.
Der erste Lauf baut einmal (~1 s), danach liegt das Bündel unter
`apps/public/tests/harness/.out/` und ist gitignoriert. Grund: die letzten
UI-Defekte hier waren allesamt unsichtbar für Logiktests.

### Was CI prüft

`.github/workflows/test.yml` fährt die gesamte Suite auf **jedem Push und jedem
Pull Request**, bewusst **ohne Pfadfilter**: der Filter des Deploy-Workflows ist
auf das ausgerichtet, was die veröffentlichte Seite verändert, und ließ damit
ganze Bereiche ungeprüft — `apps/kicktipp/**`, `docs/**` und die Workflows
selbst.

Der Deploy ruft **dieselbe Datei** als Vorbedingung auf (`workflow_call`), statt
`npm test` ein zweites Mal zu buchstabieren. Es gibt deshalb genau eine
Definition von „die Tests sind grün", und sie kann nicht auseinanderlaufen: kein
grüner Lauf, kein Deploy.

Ein zweiter Schritt prüft, dass **genau sechs** Tests übersprungen werden. Dass
sie übersprungen werden, ist der erwartete lizenzbedingte Zustand — dass es
sechs bleiben, ist die Prüfung. Ohne sie liefe ein anderswo neu übersprungener
Test unbemerkt unter derselben Erzählung mit.

Auf einem frischen Checkout laufen **397 von 403** Tests; sechs überspringen mit
begründeter Meldung, weil die clubelo-abgeleiteten Trainings-Elo-Werte nicht
committet sind. Das **Reproduktionstor der Fitprozedur ist deshalb derzeit nur
lokal prüfbar** — es zieht in CI ein an dem Tag, an dem die Trainingsdaten
committet werden dürfen. Ein „397 von 403“ ist also kein Defekt.

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
| Tests in CI auf Push und PR, Deploy daran gebunden | ✅ |
| App A — fünf Seiten (V1-Umfang) | ✅ |
| App A — Liga-Umschalter, gerenderte Tests | ✅ mit Tests |
| App B — eine selbstständige HTML-Datei | ✅ mit Tests |
| Refit als zwei Prozesse, Toleranzen ex ante | ✅ mit Tests |
| `packages/fit` — Fitprozedur im Repo, bitgleich reproduziert | ✅ mit Tests |
| Begrenzter Rating-Übertrag, Datumsprüfung der Tages-CSV | ✅ mit Tests |
| V1.1 — 2. Bundesliga per Umschalter | ✅ mit Tests |
| V1.1 — paarungsspezifische Relegation, Komplement bitgleich | ✅ mit Tests |
| V1.1 — Vorsaison-Tabelle nach erwarteten Punkten | ✅ mit Tests |
| V1.2 / V2 | ⏳ offen |

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
2. **clubelo führt vier von 36 Klubs seit dem 03.07.2026 nicht fort.** Die
   Pipeline verweigerte deshalb den Commit — bis der begrenzte Übertrag
   (v5.7 Addendum) eingeführt wurde. Die vier Klubs rechnen jetzt sichtbar
   markiert mit ihrem letzten Wert — [Details](verification/clubelo.md).

Ein Gate ist noch offen und blockiert nur V2: ob sich die Tiebreak-Reihenfolge
innerhalb des Fensters ab 1995/96 geändert hat.

## Datenpipeline

Ein geplanter Workflow ist der einzige Datenpfad. Die App holt nichts live nach;
committete Dateien sind die einzige Quelle.

Die Pipeline schreibt **nichts**, solange eine Prüfung scheitert: sie endet mit
Exit-Code 1 und unverändertem `data/`. Das ist das vorgesehene Verhalten, kein
Defekt.

Der geplante Workflow läuft bewusst **ohne** `--carry-forward-until`. Solange
clubelo die vier Klubs nicht wieder führt, scheitert er deshalb und meldet das —
die committeten Daten bleiben stehen, veralten aber. Den Schalter in den Cron zu
nehmen wäre der Sache nach ein Automatismus, und genau davor warnt das Addendum.
Wer die Saison laufend aktualisieren will, ruft die Pipeline mit dem Schalter
manuell auf, bis clubelo sich fängt.

Eine abgeschlossene Saison lässt sich vollständig neu aufbauen; der geplante
Workflow übergibt diese Flags nie:

```bash
node pipeline/src/cli.mjs --data-dir data --season 2025 --as-of 2026-06-01
```

**Wenn clubelo einen Klub nicht mehr fortführt.** clubelo schließt gelegentlich
die Reihe eines Klubs, ohne sie wieder zu öffnen — dann fehlt er in jeder
Tages-CSV. Standardmäßig scheitert der Lauf daran, und das bleibt so. Mit einem
ausdrücklichen, befristeten Schalter darf der letzte archivierte Wert einspringen:

```bash
node pipeline/src/cli.mjs --data-dir data --carry-forward-until 2026-08-31
```

Ein clubelo-Rating ist eine Treppenfunktion und ändert sich nur, wenn ein Klub
spielt; in einer echten Sommerpause *ist* der alte Wert der aktuelle. Weil die
Pipeline aber nur Ligaspiele sieht und nicht Pokal oder europäische
Qualifikation, verfällt die Regel nach spätestens **42 Tagen** — auch dann, wenn
der Schalter länger gesetzt ist. Übertragene Klubs sind in der App markiert und
im Protokoll namentlich genannt.

Der Übertrag braucht einen archivierten Snapshot aus der Zeit, als der Klub noch
geführt wurde. Fehlt er, lässt sich ein einzelner Tag nachtragen — eine Anfrage,
dieselbe Art wie der reguläre Cron:

```bash
node pipeline/src/archiveDay.mjs 2026-07-03
```

**Wo das Rating-Archiv liegt, ist Konfiguration.** clubelo veröffentlicht keine
Lizenz; die Antwort des Betreibers entscheidet, ob das Archiv im öffentlichen
Repo bleibt. Voreinstellung ist `data/ratings/`, überschreibbar über
`BUNDESLIGA_RATINGS_DIR`. Ein Umzug ist damit eine Konfigurationsänderung plus
ein Migrations-Commit, nie ein Refactoring.

### Die Relegation (§6)

Die Relegation ist **eine eigene Simulation mit eigenen Läufen** in einem eigenen
Zufallsraum (`context: "playoff"`), berechnet aus den Ligamarginalen plus einer
Paarungssimulation — kein gemeinsamer Zwei-Ligen-Lauf. Sie entsteht in
`pipeline/src/playoffArtefact.mjs` und landet in
`data/seasons/<jahr>/playoff.json`, **saisonweit, nicht je Liga**.

Zwei Eigenschaften tragen den Rest:

- **Kanonische Orientierung.** `pairingProbability` sortiert die beiden Klub-IDs,
  bevor es Schlüssel baut oder spielt. `pairing(i, j)` und `pairing(j, i)` ziehen
  deshalb dieselben Zahlen, und `P(j schlägt i) = 1 − P(i schlägt j)` gilt
  **bitgleich**. Das ist der Grund, warum die Bundesliga- und die
  2.-Liga-Ansicht nie über eine Paarung streiten können: es gibt nur eine.
- **Alle Paarungen, ohne Schwelle.** 18 × 18 = 324 Paarungen à 20 000 Läufe,
  rund 20 Sekunden je Lauf. §6 verlangt die Summe über *alle* möglichen Gegner;
  eine Kappung wäre eine stille Ungenauigkeit in einer Zahl, deren Caption
  Vollständigkeit behauptet. (Die App zeigt in der Tabelle nur Klubs ab 1 % — das
  ist Anzeige, steht in der Caption und ändert keine Rechnung.)

Das Heimrecht im Rückspiel wird **je Paarung** aus den Spielterminen abgeleitet
(SpOL § 5 Nr. 4). Solange die Relegationstermine nicht veröffentlicht sind,
liefert `secondLegHost` `null` und beide Reihenfolgen werden **je zur Hälfte**
simuliert; das Artefakt zählt mit, wie viele Paarungen davon betroffen sind, und
die Caption sagt es. Die Termine des letzten Spieltags kommen aus dem
Spielplan, den die App ohnehin hat — `lastLeagueMatchdayDates` in der
Saisonkonfiguration überschreibt sie nur, wenn der veröffentlichte Spielplan
abweicht.

Was **nicht** berechnet wird, steht im Artefakt statt zu fehlen: die Relegation
2. Bundesliga (16.) gegen 3. Liga (3.). Die App führt keine Daten der 3. Liga,
also existiert die Gegnerverteilung nicht.

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

Erlaubt ist ausschließlich **`GITHUB_TOKEN`**, das die Workflows selbst gestellt
bekommen. Sonst nichts.

Der frühere `LAB_REPO_TOKEN` ist entfallen: seit die Fitprozedur in
`packages/fit` liegt, braucht kein Workflow mehr Zugriff auf ein zweites Repo
(siehe [FIT_EXTRACTION.md](FIT_EXTRACTION.md)).

Sollte die clubelo-Antwort ein privates Datenrepo erzwingen, käme ein auf dieses
Repo beschränkter Deploy-Key hinzu — und nur der.

## Jährliche Checkliste

Vor jeder Saison:

- Europapokalplätze der kommenden Saison prüfen und die Saisonkonfiguration
  stempeln.
- Auf Regeländerungen prüfen (Auf-/Abstieg, Relegation, Tiebreak-Reihenfolge).
- Den Refit-Pull-Request prüfen. Der Sommerlauf committet nie direkt; er öffnet
  einen PR mit Monitoring-Bericht und neuen Produktionsparametern.

### Refit — wie er läuft

Die Fitprozedur liegt in [`packages/fit`](../packages/fit); der Refit ist damit
aus diesem einen Repo reproduzierbar. Kein Fremd-Checkout, kein zusätzliches
Secret.

```bash
node packages/fit/src/cli.mjs --window 2011-2025 --monitor-season 2026 --out fit-output.json
node pipeline/src/refit/cli.mjs --lab-output fit-output.json --out refit-output
```

Die erste Zeile erzeugt den JSON-Vertrag, die zweite entscheidet Prozess A oder B
und schreibt den Pull-Request-Text. Committet wird dabei nichts.

**Eine Einschränkung, solange die clubelo-Lizenzfrage offen ist:** die
Pre-Match-Elo-Werte des Trainingsfensters sind nicht committet. Auf einem frischen
Runner fehlen sie, und `refit.yml` bricht deshalb mit klarer Meldung ab statt
irgendetwas zu rechnen. Der Refit läuft derzeit lokal; sobald die Daten committet
werden dürfen, läuft er ohne weitere Änderung auch in CI.

Die Reproduktionsschranken für die Prozess-A-Ausnahme stehen in
`data/refit-tolerances.json`. Sie sind vorab festgelegt; sie nach Sicht eines
Ergebnisses zu ändern, ist genau das, was der Brief ausschließt.
