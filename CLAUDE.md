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
13. `UEBERSICHT_HEADER_FOOTER_BRIEF.md` — Präsentation mit zwei Amendments, die
    **Kontrollen entfernen**: die Läufe-Auswahl im Header entfällt (alle Seiten
    zeigen das kanonische 20 000er-Artefakt), und das Was-wäre-wenn rechnet fest
    mit 2 000 Läufen. Dazu Platzierungszonen-Umbau, entzerrtes „Wichtigstes
    Spiel" mit §10-Toggle, dreizeiliger Footer mit Version+Build-Stempel.
14. `FARBEN_UNTERTITEL_BRIEF.md` — Addendum zu 13: der Header-Untertitel ist
    entschieden, und ein Farbsystem als Tokens kommt dazu (Ausgang/Vorzeichen/
    Zonen), Farbe nie alleiniger Bedeutungsträger.
15. `ZONEN_LAYOUT_RELEASES_BRIEF.md` — Präsentation + Repo-Hygiene: Zonen-Karte
    zeigt `max(Zonenplätze, 3)`, Übersicht als Spaltenlayout, „Wie gerechnet?"
    wird geteilte Komponente und **stehende Regel**, und die Version wird Tag +
    Release (ebenfalls stehende Regel).
16. `PRESETS_FREIGEBEN_DUELLE_BRIEF.md` — ein neues Primitiv (Freigeben:
    gespielte Spiele im Was-wäre-wenn, real/freigegeben/festgesetzt, „statt real"
    klein), eine Preset-Leiste (Bereich × Rezept + „Anwenden", fünf Rezepte,
    Stapel-Semantik), eine seitenübergreifende Duell-Hervorhebung aus einer
    Quelle. **Genau ein neuer Engine-Helper** (`regionModal`, §2.3);
    `favouriteScoreline` delegiert darauf. Das Freigeben ist eine
    Datenstands-Transformation in der UI-Schicht — kein Engine-Eingriff, die
    Schlüssel bleiben datenstandsunabhängig, CRN gilt unverändert.
17. `SZENARIO_TABELLE_BRIEF.md` — Szenario-Schlusstabelle über den Veränderungs-
    Tabs, „Anwenden & rechnen", und eine geteilte `LeagueTable` für drei
    Konsumenten. **Keine neue Engine-Berechnung**: Realspalten via `rankTable`
    auf dem transformierten Datenstand, erw. Pkt/Band aus dem Szenariolauf, der
    Worker reicht `points`/`basePoints` nur durch. Der Positions-Indikator
    vergleicht gegen die **gepaarte 2 000-Läufe-Basis** (CRN), nie das Artefakt.
    Läuft vor 2.2.0; das Release umfasst dann Brief 16 + 17.
18. `SZENARIO_TABELLE_ABSCHLUSS_BRIEF.md` — Abschluss von 17: der Positions-
    Indikator zieht ans **rechte** Tabellenende (Kopf „Δ Platz"), weil er neben
    der #-Spalte als Rangänderung fehlgelesen wurde; er misst die Verschiebung in
    der erw.-Punkte-Reihenfolge. Vereinfachter Verankerungssatz. Danach **Release
    2.2.0** (Bump = Tag + Release im selben Gang, Brief 16 + 17). Keine Engine-/
    Pipeline-/Datenänderung.
19. `V2B1_HISTORISCHE_SAISONS_BRIEF.md` — historische Saisons 2011/12–2025/26 als
    zweite globale Dimension (Saison), gebaut **ausschließlich aus den committeten
    Fit-Trainingsdaten** + G1-Relegationsdaten. **Null clubelo-Anfragen** — der
    V2b-Trigger bleibt für pre-2011 (V2b.2) bestehen. Großer, mehrphasiger Brief
    (Gates → Rekonstruktion/Artefakte → Saison-Dimension → Seitenverhalten →
    Release 2.3.0); wird in Phasen-PRs ausgeliefert. **Abweichung, dokumentiert:**
    G1 lieferte über OpenLigaDB nur 2024/25+2025/26 (BL1/BL2); die „nur
    OpenLigaDB"-Zusage wurde bewusst zu „kein clubelo; OpenLigaDB + zitierte
    Wikipedia-Saisonseiten" erweitert (Nutzerfreigabe; Beleg je Eintrag).
20. `FIX_ARCHIV_SZENARIEN_PROMPT.md` — kleiner Fix vor 2.3.0: der
    `remaining.length === 0`-Frühausstieg in `Szenarien.jsx` (Brief-16-Altlast)
    entfällt ersatzlos; eine voll gespielte (Archiv-)Saison rendert die normale
    Spieltagsliste (alle Spiele **real**, Freigeben/Festsetzen, Presets).
    Einziger Leerzustand: keine Fixtures. Spieltags-Vorwahl „nächster offener,
    sonst der **letzte**". Neu: ein **Seitenebenen**-Rendertest (der alte 2014er
    prüfte unter dem Wächter und blieb grün, während die Seite abriegelte).
21. `ARCHIV_DUELLE_PROMPT.md` — kleiner Fix vor 2.3.0: (a) Bereichsregel — ein
    Preset-Bereich, der null Spiele träfe, wird nicht angeboten (regelt „offene"
    im Archiv und „gespielte" vor Spieltag 1); voll gespielt → „Alle Spiele".
    (b) **Historische Duelle**: `historicalDuels(season, timeline, …)` leitet je
    Spieltag M über den Timeline-Punkt M−1 aus derselben `directDuels`-θ-Regel ab
    — eine Implementierung, zwei Datenquellen (live `duels`, archiv
    `historicalDuels`, gebündelt in `seasonDuels`/`duelTargetsForCtx`). Archiv-
    Caption verankert; Live-Verhalten unverändert.
22. `DUELLE_ERGEBNISSE_PROMPT.md` — kleiner Fix vor 2.3.0: die Duelle-Karte zeigt
    je Ziel-Tab **zwei Abschnitte** — „Anstehend" (aus dem Outlook, min(P)-Sort)
    und „Gespielt" (`playedDuels`: Timeline-Ableitung + Ergebnis-Join, Heim
    zuerst). Leere Abschnitte verbergen sich (Vorsaison nur Anstehend, Saisonende
    nur Gespielt); Tab-Zähler = Summe. Live-Caption um einen Satz ergänzt
    (Prozente von damals, Ergebnis echt), verankert. Kein Engine-Eingriff — reiner
    Daten-Join.
23. `CHART_AUSBAU_BRIEF.md` — größeres UI-Polishing der Diagramme (Referenz WM-App).
    **Erlaubte Engine-Ergänzungen, abschließend**: zwei reine, getestete
    Aggregationen über vorhandene Werte — `zonePartition(targetProb, zones)` (§2.1,
    disjunkte Zonen-Partition, Summe-1) und `cumulativeSeries(scored, metric)`
    (§4.2, kumulative Gütereihe, letzter Punkt ≡ Gesamt); keine Simulation,
    Pipeline oder Artefaktänderung. §0 geteilte Infrastruktur (`ChartTooltip`,
    `ChartLegend`, `ChartInteractive`) als Ein-Implementierungs-Nachweis;
    Zonenverteilung statt Titelchance-Linie; Kalibrierung/Güte-Zeitreihen mit
    Achsen, Legenden, Tooltips. Danach **Release 2.3.0** über V2b.1 + die drei
    Nachfixe (20–22) + diesen Brief.

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
- **„Wie gerechnet?" ist eine Regel, nicht ein Einzelfall.** Jede Karten-Caption
  mit mehr als zwei Sätzen teilt sich in 1–2 sichtbare Sätze (die Antwort in
  Nutzersprache) plus den Methodikteil hinter der geteilten `Disclosure`
  (`components/Disclosure.jsx`, via `Card`s `method`-Prop). Nur `Disclosure.jsx`
  schreibt das rohe `<details>`; ein Quellwächter verbietet ein zweites. Kein
  per Test verankerter §4/§8-Wortlaut entfällt — er wandert höchstens hinter den
  Toggle, und `<details>` rendert ihn im DOM, sodass die Anker greifen. Neue
  Karten befolgen die Regel von Geburt an.
- **Ein Versions-Bump ist Tag + Release im selben Arbeitsgang.** `apps/public/
  package.json` wird je Release-Brief gebumpt (aktuell **2.3.0**, Release über
  V2b.1 + die Nachfixe 20–22 + den Chart-Ausbau), dann ein Git-Tag `v<version>`
  und ein GitHub-Release mit 3–6 Zeilen deutschen Notes aus dem zugehörigen Brief.
  Ältere Stände werden **nicht** rückwirkend getaggt; die Historie beginnt bei
  2.1.0. Die Footer-Version (`__APP_VERSION__` aus `apps/public/package.json` via
  Vite-`define`) verlinkt auf `…/releases/tag/v<version>`.
- **Chart-Infrastruktur ist geteilt und einfach-implementiert (CHART_AUSBAU §0).**
  `ChartTooltip` ist der einzige Schreiber von `.chart-tooltip`, `ChartLegend` der
  einzige von `.chart-legend`, `ChartInteractive` (`useActivePoint` + `HitAreas`)
  die einzige Zeiger/Touch/Tastatur-Schicht; ein Quellwächter verbietet zweite
  Schreiber, ein zweiter verbietet `<Chart>` ohne beschriftete Achse. Die
  fokussierbaren Hit-Rects tragen ihre Zusammenfassung als `aria-label` (Inhalt
  ohne Hover) und einen sichtbaren `:focus-visible`-Ring — nie `outline:none`.
  Neues neutrales Token `--zone-mid` fürs Mittelfeld-Band. Die zwei erlaubten
  Engine-Aggregationen (`zonePartition`, `cumulativeSeries`) sind rein und
  getestet; `nonCarriedScored` hält übertragene Ratings aus den Gütekurven wie
  aus den Gesamtwerten.
- **Die Übersicht ist ein Spaltenlayout (`card-columns`), kein Reihen-Grid.**
  Multi-Column stapelt Karten lückenlos (ein Grid richtet jede Reihe an der
  höchsten Karte aus). Die Leseordnung ist die Quellreihenfolge: Titelrennen →
  Wichtigstes Spiel → Abstiegskampf → Spannungsindex → Platzierungszonen, dann
  der Rest. Mobile ist eine Spalte in derselben Ordnung.
- **Keine Läufe-Auswahl mehr; alle Seiten lesen das kanonische 20 000er-Artefakt.**
  Der Header-Selector und die tote `useSimulation`/`simWorker`-Kette sind entfernt
  (Amendment B13 §2.4: real nie genutzt, „eine Simulation je Datenstand" wird ohne
  ihn wörtlicher). Der Web Worker dient nur noch den Szenarien
  (`scenarioWorker`/`useScenario`). Das Was-wäre-wenn rechnet fest mit **2 000
  Läufen** (B=20); die ersten 2 000 sind per Schlüsseldesign ein Präfix der
  kanonischen 20 000 (`runCount` in keinem Schlüssel, §3), der 3× größere
  Rauschboden steht in der Caption. Die Beispielsaison bleibt „von 20 000".
- **Farbe ist ein System aus Tokens, nie Sprenkel.** `--outcome-*` (welcher
  Ausgang, nie gut/schlecht), `--perf-*` (nur wo mehr=besser objektiv gilt —
  Leistung vs. Erwartung; **nicht** Szenarien-Deltas oder Wichtigstes Spiel, wo
  ein „+" auf Abstieg schlecht wäre), `--zone-*` (Tabellenzonen) und `--series-*`
  (Chart-Kurven). Ein Quellscan verbietet jedes Hex in Komponenten; Farbe steht
  immer neben dem Text, nie als alleiniges Signal. Die geteilten Komponenten
  (`FixturePrediction`, `WichtigstesSpiel`) tragen die Farbregel an einer Stelle.
- **Der Footer ist dreizeilig; die Parameter-Provenienz sitzt auf Methodik
  Schritt 4**, nicht im Footer (dort war sie Rauschen). Version aus `package.json`
  (gepflegt je Release-Brief, aktuell 2.3.0) plus Build-Stempel via Vite-`define`.
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
- **Was-wäre-wenn rechnet nicht automatisch.** Eingaben (`overrides`) und der
  zuletzt gerechnete Stand (`committed`) sind getrennt; nur „Szenario rechnen"
  überträgt. Ein offenes Spiel zeigt seinen Zustand (`FixturePrediction`), nie ein
  0:0-Feld, das als Annahme gelesen würde; „Festsetzen" füllt mit dem
  wahrscheinlichsten Ergebnis vor. Das veraltete Ergebnis wird gedimmt, nicht
  versteckt.
- **Brief 16 steht (Presets · Freigeben · Duelle).** Vier Stellen, an denen es
  leicht kaputtgeht:
  - **Freigeben ist eine reine Datenstands-Transformation, kein Engine-Eingriff.**
    `scenarioFixtures(fixtures, overrides)` (in `lib/season.js`) baut die
    `modifiedFixtures` in der UI-Schicht: `released` → **beide** Tore entfernt,
    `fixed` → beide gesetzt, sonst unverändert. Die Fixture-Schlüssel bleiben
    datenstandsunabhängig, also gilt CRN gegen die unveränderte Basis weiter; ein
    Test zeigt, dass ein freigegebener Nachbar keinen anderen Spielausgang im
    selben Lauf verschiebt. Wer je nur *ein* Tor setzt, weckt den Halbdefiniert-
    Guard — deshalb immer beide.
  - **Genau ein neuer Engine-Export: `regionModal(dist, region)`.** Modalergebnis
    innerhalb einer benannten Region (`homeWin`/`draw`/`awayWin`), Ties über die
    kanonische Scoreline-Ordnung. `favouriteScoreline` delegiert darauf — **eine**
    Implementierung, per Test nachgewiesen. Kein zweiter Helper (kein
    `tendencyMasses` o. Ä.): die Massen liefert `predictMatch(...).tendency`.
  - **Die Preset-Logik ist rein und stapelt.** `computePreset(...)` in
    `lib/season.js` überschreibt nur den gewählten Bereich und trägt die übrigen
    Overrides unverändert durch; die Meldungszeile zählt festgesetzt/freigegeben/
    zurückgesetzt/unverändert. „Nur Überraschungen" = Modalergebnis der
    **unwahrscheinlichsten** Tendenz (kann das Remis sein), „Verein gewinnt alles"
    = Modalergebnis in der Siegregion *dieses* Klubs, „Verein verliert alles"
    (Nach-Brief-Ergänzung) spiegelbildlich die Niederlagenregion — beide über
    dieselbe `clubWins`/`clubLoses`-Verzweigung. „Zurücksetzen" (`reset`, früher
    „Neu auswürfeln" — irreführend, weil kein Zufall) macht den Bereich wieder
    simuliert; „Zufallsergebnis" (`random`, Nach-Brief-Ergänzung) würfelt
    **Elo-frei** je Team aus derselben neutralen Poisson (`rng` injizierbar →
    rein/testbar). Ein Spiel ohne eindeutiges Rezeptergebnis bleibt unberührt.
    **Auswahlstruktur (Nach-Brief-Umbau):** Verein ist ein eigenes **erstes
    Menü** („Alle Vereine" + Klubs) und ein *intersektierender Filter* über den
    Bereich — kein Bereich mehr. Der Bereich kennt daher kein „Verein" mehr
    (open/played/matchday/duels). `clubWins`/`clubLoses` erscheinen nur bei
    gewähltem Verein und nutzen genau diesen; ein zweites Vereinsmenü entfällt.
    `computePreset` bekommt `club` als Filter (null = alle).
  - **Duell-Hervorhebung aus einer Quelle.** `duelTargetsByFixture` (über die
    θ-Liste `duels()`) speist sowohl die Was-wäre-wenn-Liste als auch Spieltage;
    `DuelChip` ist die eine geteilte Komponente (höchstes Ziel im Chip, alle im
    `title`). Keine zweite Duell-Berechnung fürs Markieren.
- **Brief 17 steht (Szenario-Schlusstabelle · Anwenden & rechnen · LeagueTable).**
  Vier Stellen, an denen es leicht kaputtgeht:
  - **Eine `LeagueTable`, drei Konsumenten** (`components/LeagueTable.jsx`):
    Spieltage (nur Realspalten inkl. Tore/Diff), Tabelle & Prognose (+ erw. Pkt
    und 10–90-Band), Szenario-Schlusstabelle (+ Indikatorspalte). Zonenstreifen,
    Legende, geteilte Plätze und die ⚑-Flagge leben **einmal** dort; ein
    Quellwächter hält den Standings-Header (`>erw. Pkt<`) auf genau eine Stelle.
    Die Zeilen kommen bereits geordnet herein (Konsument wendet
    `orderWithinSharedRanks` an); der Zonenstreifen richtet sich nach der
    **Anzeigeposition**.
  - **Kein neues Engine-Rechnen.** Realspalten via `currentTable` auf
    `forecastCompletedSeason(...)`: eine **volle Schlusstabelle** — festgesetzt
    und gespielt zählen real, offene Spiele werden mit dem wahrscheinlichsten
    Ergebnis (`predictFixture(...).favourite.scoreline`) aufgefüllt (sonst wäre
    die Vorsaison-Tabelle fast nur Nullen — Nutzerkorrektur nach dem Brief).
    Deterministische Vervollständigung; die probabilistische Wahrheit bleibt in
    erw. Pkt/Band aus dem Szenariolauf. Der Worker reicht `points`/`basePoints`
    nur **durch**; ein Test zeigt: bei unverändertem Datenstand und gleicher
    Laufzahl ist `sim.points` bitgleich zu `outlook.points`.
    `forecastCompletedSeason` setzt auf `scenarioSeason` (fixed → gespielt,
    released → offen) auf und füllt danach die offenen Spiele.
  - **Der Indikator ist CRN-ehrlich.** `expectedShiftIndicator(points,
    basePoints)` vergleicht die Erwartungs-Reihenfolge des Szenariolaufs gegen
    die **gepaarte 2 000-Läufe-Basis** desselben Laufs — **nie** gegen das
    20 000er-Artefakt, sonst stünde Stichprobenrauschen als Pfeil in der Tabelle.
    Vor dem ersten Rechnen: Artefakt-Standardwerte, **keine** Indikatorspalte.
  - **Vorzeichenfarbe ist hier erlaubt — und nur hier.** Der Positions-Indikator
    („↑2"/„↓1"/„·" als Text plus Intensität plus `perfColor`) sitzt in
    `LeagueTable`, weil Aufsteigen für den Klub eindeutig gut ist. Das
    Delta-Färbeverbot der Wahrscheinlichkeits-Tabs (`Szenarien.jsx` trägt kein
    `perfColor`/`outcomeColor`) gilt unverändert; der Quellscan bewacht das.
  - **„Anwenden & rechnen" rechnet, Einzeländerungen nicht.** Der Preset-Button
    füllt UND startet den Lauf (`onApply` setzt `committed`); eine manuelle
    Änderung danach berührt nur `overrides`, dimmt und wartet auf „Szenario
    rechnen" — die No-Autorun-Regel aus dem UX-Brief bleibt.
- **V2b.1 (Historie ab 2011/12) ist in Arbeit — ohne clubelo.** Brief 19 baut die
  Saisons 2011/12–2025/26 **allein aus den committeten Fit-Trainingsdaten**
  (`data/training/results/` + `data/ratings/training-elo/`, Pre-Match-Elo je Spiel)
  plus den G1-Relegationsdaten. Der clubelo-Trigger bleibt **unangetastet** und gilt
  weiter für **V2b.2 (vor 2011)**: clubelo-Relaunch live; Namensform-Wiederverifikation
  aller 36 Klubs bestanden; eigener V2b.2-Brief. Keine clubelo-Historienabrufe.
  - **Phase 1 (Gates) gelandet:** Klub-Register `data/clubs.json` (51 Klubs, fail-closed
    via `pipeline/src/clubRegister.mjs`); Relegationsrecord `data/relegation.json`
    (15 Saisons ×2 Grenzen, streng validiert via `pipeline/src/relegation.mjs`,
    OpenLigaDB-verankert für 2024/25+2025/26); G2 in `docs/verification/dfl-spielordnung.md`
    (Tiebreak-Kette wird Saisonkonfiguration, keine unbelegte Konstanz-Behauptung
    für 2011–2018).
  - **Phase 2 (Rekonstruktion + Artefakte) gelandet:** `pipeline/src/reconstruct.mjs`
    (Treppenfunktion, Matchday-Label statt Kalender), `pipeline/src/buildHistorical.mjs`
    (+ CLI) erzeugt den vollen Dateisatz je Saison aus Training + Rekonstruktion,
    deterministisch, `buildCurrentOutlook`/`buildFrozenTimeline` wiederverwendet.
    **Historien-Artefakte 2011/12–2023/24 committet** (`data/seasons/2011..2024`);
    2025/26 bleibt der Live-Pipeline-Stand (bessere Provenienz). Champions-Guard-Test
    prüft jede committete Saison gegen den echten Meister. Regeneration ist bitgleich
    (2015 zeigte beim Voll-Batch keinen Diff). **Nur committen, nie im Cron.**
  - **Phase 3 (Saison-Dimension) gelandet:** Die Saison ist die zweite globale
    Dimension in `App.jsx` (State `season`, `null` = neueste; Wähler `SeasonSwitch`
    als Dropdown neben dem Liga-Toggle). Eine Archiv-Saison (≠ neueste) trägt die
    Markierung („· Archiv" am Wähler und in der Überschrift, „Abgeschlossene Saison"
    statt Datenstand); `ctx.isArchive` steht den Seiten zur Verfügung. **Live-Elemente
    rendern im Archiv nie** — Staleness, Config-Stempel, Carry-forward, „Saison beginnt
    in Kürze" sind hinter `isArchive` ausgeblendet; ein Rendertest zählt sie auf und
    beweist das Gate beidseitig.
  - **Phase 4 (Seitenverhalten + Ehrlichkeit) gelandet:** Übersicht wird im Archiv
    zur **Saisonbilanz** (`components/Saisonbilanz.jsx`: Ausgang/Zonen, Relegation
    aus `data/relegation.json`, unwahrscheinlichster Moment = Meister an seinem
    Titel-Tief, größte Überraschung = Surprisal-Max). Zwei verankerte
    Ehrlichkeitssätze in `lib/archive.js`: Retrospektiv-Label (Verlauf, §4.2) und
    In-sample-Pflicht (Modellgüte, §4.1); der Szenarien-Explainer bekommt den
    Archiv-Halbsatz „(hier: die Ratings vom Saisonende)". Heatmap verbirgt sich im
    Endzustand (`remainingCount === 0`). Annotationsstruktur: `config.annotation`
    (leer = rendert nichts, §5). `relegation.json` wird jetzt synchronisiert und in
    `ctx.relegation` geladen.
  - **Release 2.3.0 vereint V2b.1, die drei Nachfixe (FIX_ARCHIV_SZENARIEN,
    ARCHIV_DUELLE, DUELLE_ERGEBNISSE) und den Chart-Ausbau** in einem Tag +
    GitHub-Release; die Chart-Arbeit landete danach noch im selben Release.
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
