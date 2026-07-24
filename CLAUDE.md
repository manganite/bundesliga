# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sprache: Oberfläche und Projektdokumentation deutsch, Code und Codekommentare englisch.

## Befehle

```bash
npm test                       # alle Tests (engine, pipeline, kicktipp), offline
npm run test:engine            # nur die Engine
node --test packages/engine/tests/ranking.test.mjs          # eine Testdatei
node --test --test-name-pattern="floor" "packages/engine/tests/**/*.test.mjs"   # ein Test

npm run pipeline               # Pipeline-Lauf gegen die Live-Quellen
npm run gate:clubelo           # §11-Abdeckungsprüfung (clubelo)
npm run dev   --workspace @bundesliga/app        # App A lokal
npm run build --workspace @bundesliga/app        # App A bauen
npm run build:kicktipp                           # App B -> apps/kicktipp/dist/kicktipp.html
```

Die Testpfade brauchen Glob-Anführungszeichen; `node --test <verzeichnis>` scheitert.
Es gibt keinen Linter und keinen Build-Schritt für Engine oder Pipeline — beides ist
reines ESM ohne Transpilation.

Eine abgeschlossene Saison lässt sich vollständig neu aufbauen (V2-Vorarbeit, und der
einzige Weg, die Pipeline zu üben, solange die laufende Saison keine Ratings hat):

```bash
node pipeline/src/cli.mjs --data-dir data --season 2025 --as-of 2026-06-01
```

Der geplante Workflow übergibt diese Flags **nie**; die automatische Saisonerkennung
bleibt der einzige Produktionspfad.

Nach jeder Änderung an den Zufallsströmen prüfen, ob der Unterschied nur Streuung ist:

```bash
node pipeline/src/compareArtefacts.mjs <alteSeasonsDir> <neueSeasonsDir>
```

## Der Brief ist die Spezifikation — aber verifizierte Primärquellen schlagen ihn

Die Vorgaben liegen in [docs/briefs/](docs/briefs/), mit einem Index, der die
Reihenfolge erklärt — aus den Dateinamen ist sie nicht ablesbar. **Die jeweils
spätere schlägt die frühere:**

1. `BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md` — die Grundvorgabe.
2. `V5.7_ERRATUM_AND_V1_FIXES.md` — korrigiert §6 gegen die Spielordnung, ordnet die
   Engine-Korrekturen an (Protokoll 2) und trennt README von Entwicklerdoku.
3. `V5.7_ADDENDUM_CLUBELO.md` — der begrenzte Rating-Übertrag als befristeter Schalter
   und die Datumsprüfung der Tages-CSV.
4. `FIT_EXTRACTION_BRIEF.md` — die Fitprozedur zieht nach `packages/fit`; das
   Reproduktionstor ist die Abnahme, und die Summationsreihenfolge zu ändern ist
   ab jetzt eine Prozess-B-Änderung.
5. `PRE_V1.1_CLEANUP_BRIEF.md` — setzt die Cron-Flag und trägt zwei Zusätze für den
   V1.1-Umfang.
6. `CLUBELO_FOLLOWTHROUGH_BRIEF.md` — nach der Erlaubnis des clubelo-Betreibers:
   Trainingsdaten committet, Reproduktionstor in CI, ein Abruf pro Tag, App B in CI.
7. `V2A_SZENARIEN_BRIEF.md` — nur die Szenarien-Hälfte von V2; die Historie (V2b)
   ist ausdrücklich zurückgestellt, mit definierter Auslösebedingung am Ende.
8. `SZENARIEN_UX_BRIEF.md` — reine Präsentation plus eine Spezifikationsänderung:
   §10 wird **verfeinert, nicht gebrochen** — *analytische* Interaktion (Eingaben,
   die Prognosen ändern) bleibt exklusiv auf Szenarien; die neue Methodik-Seite
   trägt genau ein *illustratives* Widget (die Beispielsaison), das nichts
   analysiert und nichts ändert.
9. `SZENARIEN_TABS_TEXTE_BRIEF.md` — Ergebnistabelle in Tabs je Ziel, plus wörtliche
   Textrevisionen und **eine Inhaltskorrektur** in Methodik Schritt 1: der Satz
   „ein Favorit gewinnt darum nicht in jedem Durchlauf" hängte den Spielausgang
   fälschlich an `RATING_SIGMA` (Unsicherheit über die *Stärke*, nicht Spielzufall,
   §3) — die Ursache steht jetzt in Schritt 2 bei der Torziehung.
10. `SCORELINE_KONVENTION_BRIEF.md` — hebt die „keine Engine-Änderung"-Klausel für
    **genau eine** reine Anzeige-Hilfsfunktion auf: `favouriteScoreline`. Das
    angezeigte „wahrscheinlichste Ergebnis" ist ab jetzt das Modalergebnis
    *innerhalb der wahrscheinlichsten Tendenz*, nicht das globale Modalergebnis.
11. `TEXTMASS_DUELLE_BRIEF.md` — reine Präsentation: ein Textmaß-Token
    `--measure-text` (~88ch) als einzige Quelle für Fließtextbreite, reine
    Textkarten ziehen sich darauf zusammen; „Direkte Duelle" bekommt Tabs je Ziel
    über dieselbe geteilte `Tabs`-Komponente wie die Szenario-Ergebnistabelle.
12. `ZAHLENFORMAT_BRIEF.md` — reine Präsentation: `percent()` mit fester
    Nachkommastelle, ein Vorzeichen-Pfad (`pp`/`points`/`signed`) statt
    handgerollter, `rating()` ohne Tausenderpunkt, und die Restprogramm-Schwere
    als Abweichung vom Ligamittel — vor dem 1. Spieltag verborgen.

Die Briefe selbst werden **nicht bearbeitet**: sie sind das Protokoll dessen, was
wann entschieden wurde, auch dort, wo es sich später als falsch erwies.

Wo eine verifizierte Primärquelle allen widerspricht, gilt die Quelle. §11 macht
mehrere Prüfungen zur Vorbedingung, und **zwei davon haben ergeben, dass der Brief
falsch lag** — das Erratum hat sie inzwischen in die Spezifikation zurückgeführt.
Die Befunde stehen mit Quelle und Datum in [docs/verification/](docs/verification/).
Wer nur v5.6 liest, baut die Fehler wieder ein:

- **Tiebreak-Reihenfolge (§6 war falsch).** Die DFL-Spielordnung kennt keine Stufe
  „Punkte im direkten Vergleich"; Kriterium 3 ist das *Gesamtergebnis* aus Hin- und
  Rückspiel, Kriterium 4 separat die Auswärtstore im direkten Vergleich. Zusätzlich
  fehlten dem Brief die In-Saison-Regeln ganz: vor absolviertem Rückspiel zählen nur
  Tordifferenz und Tore, Unauflösbares steht auf **geteiltem Tabellenplatz**
  (`sharedRank`), und Kriterium 6 gilt während der Saison nicht.
- **clubelo bewertet alle Wettbewerbe**, die Spielpläne hier nur die Liga. Prüffenster,
  die breiter als ±2 Tage sind, melden deshalb Scheinfehler.

Kein Wert und keine Regel wird geraten. Wo eine Quelle etwas nicht hergibt, steht das
als dokumentierte Lücke — nicht als plausibler Ersatzwert.

## Architektur

`packages/engine` ist die einzige Quelle der Wahrheit für Modell, Ligaregeln und jede
Metrik. Beide Apps konsumieren sie; keine implementiert etwas davon neu.

```
packages/engine/src/
  rng.mjs        counter-based Uniforms (kein Stream-Zustand) + AS241
  model.mjs      Poisson + Dixon-Coles, additive BL2-Deltas, kanonische Reihenfolge
  ranking.mjs    DFL-Ranker nach verifizierter Spielordnung, inkl. geteilter Plätze
  metrics.mjs    alle §4-Metriken
  simulate.mjs   Monte-Carlo, CRN, per-Batch-Frequenzen
  dataState.mjs  Datenstand, Veraltungswarnung, Saisonphase (App A konsumiert das)
```

Die Kicktipp-Logik liegt **absichtlich nicht** in der Engine (`apps/kicktipp/src/`):
App A darf laut §10 nichts Tipp-Bezogenes enthalten. App B importiert die Engine nur
für das Modell und bündelt sie in ihre eine HTML-Datei.

### Simulationsvertrag (§3) — die Stellen, die man nicht anfassen darf

- **Zwei Schlüssel, nie einer.** Artefakt-Key `(dataHash, runCount, engineVersion)`
  entscheidet, *welches* Artefakt man sieht. Der Zufalls-Key ist davon unabhängig und
  enthält `runCount` bewusst **nicht** — mehr Läufe müssen die Stichprobe *verlängern*,
  nicht neu ziehen.
- **Kein Stream-Sampler.** Ein mutabler RNG-Zustand verbraucht datenabhängig viele
  Variaten, desynchronisiert die Ströme und zerstört die CRN-Aufhebung. Das V1-
  Abnahmekriterium schließt ihn ausdrücklich aus.
- **Kanonische Scoreline-Reihenfolge: nach Gesamttoren, dann Heimtore.** Nicht
  row-major — gemessen, nicht gewählt (Zahlen stehen in `model.mjs`). Eine Änderung
  bricht CRN gegen jedes bestehende Artefakt und verlangt einen Bump von
  `SIMULATION_PROTOCOL_VERSION` (steht aktuell auf **2**).
- **Ein Protokoll-Bump ändert JEDEN Schlüssel**, weil die Version in jeden Schlüssel
  gehasht wird. Zwei Artefakte unter verschiedenen Protokollversionen sind damit
  **unabhängige** Stichproben, keine gepaarten — die gepaarte SE-Formel aus §3 gilt
  dort nicht. `pipeline/src/compareArtefacts.mjs` rechnet richtig und begründet es.
- **Jede Ziehung hat ihren eigenen `drawKind`.** Kein Wiederverwenden eines fremden
  Schlüssels mit verbogenem Laufindex; Kollisionen werden beim Setup geprüft.
- **`SE(Δ) = SD(Δ_b)/√B`.** Die Division durch √B ist tragend; ohne sie ist der
  Rauschboden bei B = 20 rund 4,5-fach zu groß.

### Pipeline (`pipeline/src/`)

Reihenfolge ist nicht beiläufig:
`fetch → Klubs auflösen (fail closed) → verifizieren → archivieren → ableiten → schreiben`

Alles wird im Speicher berechnet und **vor** dem ersten Schreiben geprüft, damit ein
gescheitertes Gate das Repository unberührt lässt.

- **`clubMapping.mjs` scheitert laut.** Ein unaufgelöster Klub blockiert den Commit.
  clubelo führt zwei Namensformen (URL ohne Leerzeichen, CSV-Feld mit) und antwortet auf
  einen falschen Namen mit **HTTP 200 und leerem Body** — deshalb `hasRealHistory()`.
  Die Eins-zu-eins-Bedingung liegt auf der Klubidentität, nicht auf der OpenLigaDB-`teamId`
  (Würzburger Kickers hat zwei).
- **`snapshots.mjs`**: unveränderlich, idempotent, atomar angehängt, nie verschoben.
  `observedAt` und `effectiveAt`, bewusst **kein** globales `phase`-Feld.
- **`preMatch.mjs`**: pro Partie der verwendete Snapshot, die Regel und die
  `provenance`. `contemporaneous` nur bei `observedAt` vor Anstoß; Einträge sind
  **write-once**, damit ein solcher Eintrag später nicht zu `backfilled` verfällt.
  Die Prognoseregel nimmt den Snapshot *strikt vor* dem Anstoßdatum, das Richtungs-Gate
  in `verify.mjs` die Zeile *des Spieltags* — diese Asymmetrie ist beabsichtigt und in
  beiden Dateien begründet.
- **„Commit only on change"**: `dataUpdatedAt` bewegt sich nur bei substantieller
  Änderung. Persistierte Dateien müssen reine Funktionen ihrer Eingaben sein — eine
  Laufstatistik darin erzwingt alle zwei Stunden einen Commit und ein Deployment.
- **Datenalter ≠ Workflow-Gesundheit.** Die App leitet aus `dataUpdatedAt` keine
  Aussage über den Workflow ab; die einzige ehrliche Veraltungswarnung ist
  spielplanbasiert.
- **Wo das Rating-Archiv liegt, ist Konfiguration**, nicht Annahme: Voreinstellung
  `data/ratings/`, überschreibbar über `BUNDESLIGA_RATINGS_DIR` oder den Parameter
  `ratingsDir`. clubelo hat keine Lizenz veröffentlicht; ein Umzug in ein privates
  Repo muss Konfiguration bleiben, nie ein Refactoring.
- **Der Backfill pausiert 750 ms** zwischen clubelo-Anfragen. Entwicklung und Tests
  laufen nie gegen die Live-API.
- **Rating-Übertrag ist ein Schalter, kein Automatismus** (`carryForward.mjs`).
  Ohne `--carry-forward-until` scheitert ein fehlender Klub weiterhin den Lauf.
  Harte Decke 42 Tage, auch wenn der Schalter länger gesetzt ist; `effectiveAt`
  wird nie umgeschrieben; der Provenance-Wert `carried-forward` steht neben
  `contemporaneous` und `backfilled` und darf in Modellgüte-Zahlen nicht mit
  ihnen vermischt werden. Ein übertragener Wert kommt **nie** ins Archiv — dort
  steht nur, was clubelo tatsächlich veröffentlicht hat.
- **Die Tages-CSV wird gegen das angefragte Datum geprüft.** clubelo liefert bei
  Überlast zwischengespeicherte Seiten, die strukturell einwandfrei sind und einen
  anderen Tag beschreiben; ≥ 90 % der Zeilen müssen das Datum abdecken.

### App A (`apps/public/`)

Liest ausschließlich committete Artefakte; **kein** Browser-Fetch von Ergebnissen oder
Ratings. Der Web Worker rechnet nur die *Ansicht* neu, wenn der Nutzer die Laufzahl
ändert — Spieltagsdifferenzen bleiben immer auf dem kanonischen 20 000-Lauf-Artefakt.
Schwere Artefakte entstehen in `pipeline/src/artefacts.mjs`, nie im Browser.

`components/Chart.jsx` erzwingt den Barrierefreiheitsvertrag aus §10 zentral
(`role="img"`, datengetriebenes `aria-label`, `title`/`desc`, versteckte Datentabelle) —
`table` ist Pflichtparameter, nicht optional.

### App B (`apps/kicktipp/`)

Eine selbstständige HTML-Datei, **nie deployt, nie verlinkt**; der Deploy-Workflow
veröffentlicht ausschließlich `apps/public`. Eingefügtes ist nicht vertrauenswürdig:
`DOMParser`, nur validierte typisierte Felder kommen zurück, alles andere wird
**verworfen statt bereinigt angezeigt**. Ein Test durchsucht den Quelltext nach
`innerHTML`, `outerHTML`, `insertAdjacentHTML` und `document.write`.

Punkteschema ist **best-of, max 11**: Quote 3–9 plus genau *ein* Bonus (Sieg: +2 exakt
oder +1 Tordifferenz; Remis: nur +2 exakt, kein Tordifferenz-Rang). Scoreline-Form durch
**Region-Umgewichtung, nicht λ-Fitting** — die Marktränder stimmen dadurch exakt by
construction.

## Aktueller Zustand

**Wer den Projektzustand ändert, aktualisiert diese Sektion im selben Commit.**

- **Saison 2026/27 ist live**, Vorsaison-Zustand, noch kein Spiel gespielt. Die
  abgeschlossene Saison 2025/26 liegt weiterhin committet daneben.
- **Vier Klubs rechnen mit einem übertragenen Rating vom 2026-07-03**, weil clubelo
  ihre Reihen seither nicht fortführt: Bayern und Stuttgart (BL1), Wolfsburg und
  Kaiserslautern (BL2). In der App je Klub mit ⚑ markiert, in der Kopfzeile benannt.
  Der Cron läuft mit `--carry-forward-until=2026-08-14`; jeder andere Einstiegspunkt
  bleibt ohne Flag fail-closed.
- **Der Übertrag läuft von selbst aus, und für BL2 früher als für BL1.** Die harte
  42-Tage-Decke ab `effectiveAt` endet am **2026-08-14** — danach ist er unabhängig
  von jeder Flag unmöglich. Wolfsburg und Kaiserslautern fallen aber schon ab
  **2026-08-07** heraus: das ist der 1. BL2-Spieltag, und ein bekanntes Spiel in der
  Lücke hebt das Treppenfunktions-Argument auf. Führt clubelo sie bis dahin nicht
  wieder, scheitert der Lauf ab dem 07.08. wieder fail-closed. Die Eskalation ist
  also Anfang August fällig, nicht Mitte.
- Die Fitprozedur liegt seit der Extraktion in `packages/fit` und reproduziert die
  ausgelieferten Parameter **bitgleich** (`docs/FIT_EXTRACTION.md`). `LAB_REPO_TOKEN`
  ist entfallen; erlaubt ist nur noch `GITHUB_TOKEN`.
- **Die clubelo-Lizenzfrage ist beantwortet (2026-07-23).** Der Betreiber erlaubt
  sowohl das geplante Abrufmuster als auch die öffentliche Weitergabe abgeleiteter
  Ratings; Wortlaut beider Seiten in `docs/verification/clubelo.md`. Folgen: die
  Trainings-Elo-Werte sind committet, das **Reproduktionstor läuft in CI**, der
  Vorab-Abbruch in `refit.yml` ist weg, und **nichts wird mehr übersprungen** —
  `.github/workflows/expected-skips.json` steht auf 0 und wird geprüft.
  Die Höflichkeitsregel bleibt und ist jetzt Code: **der Tagesabruf entfällt, wenn
  der heutige Stand schon im Archiv liegt** — eine clubelo-Anfrage pro Tag statt
  zwölf. Der Betreiber startet die Website vor der Saison neu; das Diagnose-Playbook
  für den ersten roten Lauf steht in `docs/verification/clubelo.md`.
- **Die Summationsreihenfolge der Likelihood ist Teil der Prozedur.** Nelder-Mead ist
  ableitungsfrei und verstärkt eine Differenz von 1e-14 bis in die zweite Stelle: die
  Trainingsdaten anders zu sortieren verschob `HOME_ADV_GHOST` um 2,2. Die Reihenfolge
  ist in `packages/fit/src/data.mjs` festgenagelt; sie zu ändern ist Prozess B.
- **V1.1 steht.** Beide Ligen liegen hinter einem Umschalter, die Relegation ist
  paarungsspezifisch berechnet, und die Vorsaison-Tabelle ist innerhalb des geteilten
  Tabellenplatzes nach erwarteten Punkten sortiert. Die drei Stellen, an denen das
  leicht kaputtgeht:
  - `packages/engine/src/playoff.mjs` orientiert jede Paarung **kanonisch** (Klub-IDs
    sortiert). Dadurch gilt `P(j schlägt i) = 1 − P(i schlägt j)` **bitgleich**, nicht
    nur im Rahmen des Monte-Carlo-Fehlers — beide Ligaansichten lesen wirklich dieselbe
    Simulation. Wer die Argumentreihenfolge in die Schlüssel zurückholt, zerstört das
    lautlos.
  - `data/seasons/<jahr>/playoff.json` ist **saisonweit, nicht je Liga**. Eine Kopie je
    Liga könnte auseinanderlaufen.
  - `playoffPlaces` in der Ligakonfiguration ist Pflicht. Fehlt es, behauptet die
    Clinch-Logik „Klassenerhalt nicht mehr möglich", sobald Platz 15 unerreichbar ist —
    und das ist eine **Garantie**, die falsch wäre, solange Platz 16 noch geht.
    `pipeline/tests/seasonConfig.test.mjs` hält das fest.
- **CI: `test.yml` ist das Tor.** Läuft auf jedem Push und jedem Pull Request ohne
  Pfadfilter; der Deploy ruft dieselbe Datei per `workflow_call` als Vorbedingung
  auf, statt `npm test` erneut zu buchstabieren — eine Definition von „grün", die
  nicht auseinanderlaufen kann. Ein zweiter Schritt prüft, dass es **genau sechs**
  Skips sind. Ändern sich die Trainingsdaten-Lizenzlage oder die Testzahl, gehört
  diese Zahl zusammen mit `docs/DEVELOPMENT.md` angepasst.
- **V1.2 steht.** Modellgüte-Seite, Live-Rating-Timeline mit der Frozen/Live-
  Gegenüberstellung, und „Wichtigstes kommendes Spiel" auf Übersicht und Spieltage.
  Vier Stellen, an denen das leicht kaputtgeht:
  - **Drei Provenienzen, nie stillschweigend gepoolt.** `modelQuality.mjs` gibt zu
    jeder gemischten Zahl eine `note` zurück; eine Ansicht, die die Zahl zeigt und
    die Note wegwirft, ist genau der Fehler, den §5.3 verbietet. Die Provenienz
    wird **je Klub** aufgelöst — 64 der 66 übertragenen Einträge betreffen nur
    einen der beiden Klubs.
  - **Der Rekombinationstest läuft in `simulateSeason` selbst**, vor dem Schreiben.
    Er ist exakt, nicht tolerant: jeder Lauf fällt in genau einen Ausgang. Schlägt
    er fehl, ist das Tallying falsch — keine Toleranz nachziehen.
  - **Die Live-Timeline liest den Index NACH dem Anhängen des Tagessnapshots.**
    Davor gelesen hinkt sie einen Lauf hinterher und schreibt bei jedem Lauf neu,
    was „commit only on change" bricht.
  - **`Card`s `when` schützt die Kinder nicht.** JSX-Kinder werden gebaut, bevor
    `Card` entscheidet — eine Karte, die in ein womöglich leeres Array greift,
    stürzt genau im leeren Zustand ab, den diese Version aushalten muss.
- **Die Karte „Rating-Verzögerung" aus §7 heißt jetzt „Rating-Aktualität".** Der
  alte Name versprach die Messung, dass das Elo träge folgt; die findet nicht
  statt, und §9 ordnet genau diese Behauptung als „reasoning, not measurement"
  ein. Definition und Begründung: `docs/METRIC_ADDENDA.md`.
- **V2a steht.** Die Szenarien-Seite ist die einzige mit interaktiven Werkzeugen
  (§10): Was-wäre-wenn, Beispielsaison, und der Solver „Was muss passieren?". Vier
  Stellen, an denen es leicht kaputtgeht:
  - **Der Solver garantiert konservativ, nie knapp.** Ein erschöpfendes Orakel auf
    kleinen Ligen zählt jede mögliche Vervollständigung durch und prüft, dass die
    Garantie **nie verletzt** wird — geprüft wird Solidität, nicht Minimalität. Die
    Property-Tests decken größere Ligen ab. Wer die Garantie „schärfer" macht,
    riskiert eine falsche Garantie; das ist §7 ausdrücklich verboten.
  - **Jede ausgegebene Hilfe-Kombination trägt ein maschinenprüfbares Zertifikat
    und ist teilminimal.** Die UI prüft das Zertifikat **selbst nach**, bevor sie
    es zeigt (`verifyHelpCertificate(result.__state, combo)`). Vollständigkeit der
    Suche wird nirgends behauptet oder getestet.
  - **Der Solver ist bei > 5 Spieltagen ganz abwesend**, nicht ausgegraut, nicht
    angeteast (§7). Beim Auguststart bleibt er monatelang unsichtbar — das ist
    richtig; die Tests sind sein Existenzbeweis. Keine Debug-Hintertür.
  - **Beispielsaison ist bitgleich ein Lauf der vollen Simulation** (`drawSeasonRun`
    baut dieselben Schlüssel). „Lauf #17 von 20 000" ist eine echte, reproduzierbare
    Stichprobe, keine frische Ziehung. `runCount` geht in keinen Schlüssel (§3).
- **Der Backfill-Trigger ist lückenbasiert, nicht „erster Lauf".** Nach einem
  degradierten Start (clubelo noch nicht erreichbar, kein Vorsaison-Snapshot) würde
  ein „nur beim ersten Lauf"-Tor den Vorsaison-Punkt für immer offen lassen — der am
  degradierten Lauf archivierte Tages-Snapshot lässt jeden späteren Lauf glauben, es
  sei fertig. Deshalb: was das Archiv an Pflichtterminen vermisst und clubelo jetzt
  liefern könnte, wird nachgeholt; fehlt nichts, wird keine Historie abgerufen. Das
  ist die BL2-Relaunch-Kante aus dem V2a-Brief.
- **§10 ist verfeinert (SZENARIEN_UX):** die Grenze läuft zwischen *analytischer*
  und *illustrativer* Interaktion, nicht zwischen Seiten. Was-wäre-wenn und der
  Solver (Eingaben, die Prognosen ändern) bleiben auf Szenarien; die Beispielsaison
  (zeigt nur, ändert nichts) sitzt auf Methodik. Der Quellwächter prüft auf
  `analyseRequirement`/`kind: "whatif"` außerhalb Szenarien, nicht mehr auf jedes
  interaktive Element. Die geteilte Vorhersage-Darstellung (`FixturePrediction`)
  steht an genau einer Stelle — What-if-„Simuliert" und Methodik-Schritt 2 zeigen
  dieselbe Komponente, nie eine zweite Kopie.
- **„Wahrscheinlichstes Ergebnis" heißt: innerhalb der wahrscheinlichsten Tendenz.**
  Das globale Modalergebnis ist fast immer ein Remis (Remis bündeln ihre Masse auf
  wenige Ergebnisse, Siege verteilen sie), was neben „Heimsieg 57 %" wie ein
  Widerspruch aussieht. `favouriteScoreline` in `model.mjs` ist die eine erlaubte
  Anzeige-Hilfsfunktion; Ties lösen sich über die kanonische Scoreline-Ordnung,
  keine neue Konvention. Anzeige und „Festsetzen"-Vorbelegung nutzen dieselbe
  Funktion über `FixturePrediction` — kein zweiter Anzeigepfad.
- **Die Rendertest-Harness baut je Prozess in ein eigenes `.out/p<pid>`.** node:test
  fährt Testdateien parallel; ein gemeinsames Ausgabeverzeichnis lässt zwei Vite-
  Builds einander mitten im Schreiben überschreiben — ein Wettlauf, der als
  sporadischer Fehlschlag auftaucht, sobald genug Dateien die Harness nutzen.
- **Tabs sind eine geteilte Komponente (`components/Tabs.jsx`), nicht zwei.** Die
  Was-wäre-wenn-Ergebnistabelle und „Direkte Duelle" konsumieren sie beide; nur
  `Tabs.jsx` schreibt die Rollen `tablist`/`tab`/`tabpanel`. Ein Quellwächter
  verbietet ein zweites `role="tablist"` anderswo. Vorwahl je Ort ist der
  interessanteste Tab (größter Effekt bzw. brisantestes Duell), damit die
  Schlagzeile ohne Klick sichtbar ist.
- **Prozentpunkte und Vorzeichen kommen aus format.js, nirgends handgerollt.**
  `pp(delta)` ist der eine signierte Pp-Pfad (echtes „−"), `points(value)` der
  unsignierte für Beträge (ECE, Verschiebung), `signed`/`signedInt` für Zahlen,
  `rating()` für Elo **ohne** Tausenderpunkt. Ein Quellscan verbietet das Literal
  „ Pp." und `? "+" :`-Vorzeichenpräfixe außerhalb format.js. `percent()` zeigt
  eine feste Nachkommastelle; die Randwert-Politik (0 %/100 % nur bei echt 0/1,
  sonst <0,1 %/>99,9 %) bleibt.
- **Restprogramm-Schwere ist Präsentation über den Engine-Mitteln.** Primär die
  Abweichung vom Ligamittel der Gegner (10–30-Punkte-Unterschiede um ~1670 sonst
  unlesbar), nach Schwere sortiert. **Vor dem 1. Spieltag verborgen**: solange
  jeder Klub Heim- und Auswärts-Restmenge gleich hat, trägt die Karte keine
  Spielplaninformation (nur Selbstausschluss-Arithmetik) — sie erscheint mit dem
  ersten gespielten Spiel.
- **Fließtextbreite kommt aus genau einem Token, `--measure-text` (~88ch).** Kein
  Fließtext-Element trägt eine eigene `max-width`; ein Quellscan erzwingt das.
  Reine Textkarten (`<Card textOnly>`) ziehen sich aufs Maß plus Padding zusammen,
  damit Text- und Kartenrand zusammenfallen — Karten mit Tabelle, Chart oder dem
  Beispielsaison-Raster behalten die volle Breite.
- **Kein Satz erklärt einen verlorenen Favoritensieg mit `RATING_SIGMA`.** Die
  Streuung bildet Unsicherheit über die *Stärke* ab, nicht den Spielzufall (§3
  wörtlich). Warum ein Favorit ein Spiel verliert, gehört zur Torziehung
  (Methodik Schritt 2), nicht zur Streuung (Schritt 1). Ein Test verankert den
  korrigierten Wortlaut, damit der falsche Kausalsatz nicht zurückkehrt.
- **Was-wäre-wenn rechnet nicht automatisch.** Eingaben (`fixed`) und der zuletzt
  gerechnete Stand (`committed`) sind getrennt; nur „Szenario rechnen" überträgt.
  Ein offenes Spiel zeigt seinen Zustand (`FixturePrediction`), nie ein 0:0-Feld,
  das als Annahme gelesen würde; „Festsetzen" füllt mit dem wahrscheinlichsten
  Ergebnis vor. Das veraltete Ergebnis wird gedimmt, nicht versteckt.
- **V2b (Historie) existiert nicht als Aufgabe.** Auslösebedingung (alle drei):
  clubelo-Relaunch live; die einmalige Namensform-Wiederverifikation aller 36 Klubs
  auf der neuen Schnittstelle bestanden; ein eigener V2b-Brief geschrieben. Bis
  dahin: nicht anfangen. Keine clubelo-Historienabrufe für eine 30-Saison-Abdeckung.
- Das README beschreibt die App; alles Entwicklerische steht in
  `docs/DEVELOPMENT.md`. Code GPL-3.0 (`LICENSE`); committete OpenLigaDB-Daten
  ODbL; committete clubelo-Daten unter `data/ratings/` **nicht** ODbL, sondern
  unter der Erlaubnis vom 2026-07-23. Drei Lizenzlagen, nicht vermischen.
  Die archivierten Snapshots werden dafür **nicht** nachträglich umgeschrieben —
  sie sind unveränderlich; die Lizenzlage steht im README und in
  `docs/verification/clubelo.md`.

## Fallen, die hier schon Zeit gekostet haben

- **Literale NUL-Bytes machen eine Quelldatei für `grep` unsichtbar.** `rng.mjs` trug
  vier davon als Schlüsseltrenner; die Datei lief einwandfrei, aber jede Suche über das
  Repo hat sie **stillschweigend übersprungen** — auch eine Prüfung, die genau einen
  ihrer Exporte bestätigen sollte. Der Trenner selbst ist richtig (NUL kann in keiner
  Klub- oder Spiel-ID vorkommen, sonst wären die Schlüssel mehrdeutig); er muss nur als
  Escape-Sequenz geschrieben werden. `packages/engine/tests/sourceHygiene.test.mjs`
  bewacht das jetzt. Wenn `file <datei>` „data" statt „JavaScript source" sagt, ist das
  der Grund.
- **Deutsche Anführungszeichen in JS-Strings.** `"„Text""` beendet den String zu früh;
  schließend gehört `“`. Trifft Testnamen und Berichtstexte. Der Render-Test hat es
  einmal in einer Caption gefunden, wo es nur *falsch aussah* statt zu brechen.
- **Die Heimrecht-Regel der Relegation liest sich falsch herum.** „Weniger spielfreie
  Tage vor dem Hinspiel" heißt: Der **Zweitligist** hat das Heimrecht im **Rückspiel**,
  weil sein 34. Spieltag auf den Sonntag nach dem Bundesliga-Samstag fällt. Gegen die
  DFL-Aussage und die gesamte Historie seit 2008/09 geprüft
  (`docs/verification/dfl-spielordnung.md` §4.5.1); ein Test hält den Normalfall fest,
  weil beide Richtungen plausibel aussehen.
- **Grid-Spuren brauchen `minmax(0, 1fr)`.** Ohne das bläht ein breites Kind die Spalte
  auf und die Seite scrollt auf dem Handy seitlich.
- **Der Node-Pin in den Workflows muss die `engines` optionaler nativer Bindings
  erfüllen.** npm überspringt eine optionale Abhängigkeit mit verfehlter Bedingung
  **stillschweigend**; der Build stirbt dann mit `MODULE_NOT_FOUND` weit entfernt von der
  Ursache.
- **Der Echtdaten-Ranker-Test ist weniger trennscharf, als er aussieht.** Keine der 22
  Saisons brauchte Kriterium 3 oder höher — die H2H-Logik deckt nur `ranking.test.mjs`
  ab. Steht so im Test; die Aussage nicht überdehnen.

## Ehrlichkeit (§8) — gilt für Code, Captions und Commit-Messages

Ein Nullbefund ist „kein messbarer Vorteil", nie „gibt es nicht". Keine kausale Aussage
über die Geisterspielsaisons. Keine Präzisionszahl aus den per-match-Intervallen des
Labs. Wo eine Auswertung in-sample ist oder auf `backfilled`-Ratings beruht, muss das
dranstehen — Modellgüte darf die beiden Provenance-Gruppen nie stillschweigend mischen.
