# Brief — Chart-Ausbau: Tooltips, Legenden, Zonenverteilung, Güte-Zeitreihen

**Referenz ist die WM-App. Erlaubte Engine-Ergänzungen, abschließend: reine,
getestete Aggregationsfunktionen über vorhandene Werte (§2.1 Partition,
§4.2 kumulative Gütereihen) — keine Simulation, keine Pipeline-, keine
Artefaktänderung. Danach Release 2.3.0 über V2b.1 + Nachfixe + diesen
Brief.**

## 0 · Geteilte Infrastruktur zuerst

- **Ein `ChartTooltip`** und **eine `ChartLegend`** (Ein-Implementierungs-
  Nachweis wie `Disclosure`/`Tabs`): Zeiger + Touch (Tippen hält den
  Tooltip) + Tastatur (fokussierbare Punkte, Pfeiltasten über Spieltage);
  Inhalt zusätzlich als visually-hidden Text erreichbar — Farbe und Hover
  sind nie die einzigen Träger.
- Tooltip-Standardaufbau: Titelzeile (Spieltag/Datum) → Wertzeilen (Label,
  Wert, Δ zum Vorpunkt als `pp()`) → optionale Kontextzeilen. Alle Charts
  konsumieren dieses eine Format.
- Jede Y-Achse bekommt Beschriftung mit Einheit. Ausnahmslos — der Scan
  auf achsenlose SVG-Charts darf das absichern.

## 1 · Verlauf (Mehrklub-Chart)

- **Legende** mit vollen Klubnamen und Serienfarben (die abgeschnittenen
  Endlabels entfallen); Klick auf Legendeneintrag hebt die Serie hervor
  (dimmt die anderen), zweiter Klick zurück.
- **Tooltip je Spieltag:** Spieltag N; alle sichtbaren Klubs mit Wert und
  Δpp, sortiert nach Wert; als Kontextzeilen die **zwei größten
  Überraschungen des Spieltags** (Ergebnis + Surprisal — die Daten liegen
  in den Pre-Match-Datensätzen, WM-Vorbild „Paraguay 0:1 France").
- Gilt identisch für Archiv-Saisons (gleiche Komponente, Retrospektiv-
  Label bleibt).

## 2 · Teams-Seite

### 2.1 „Zonenverteilung im Saisonverlauf" ersetzt die Titelchance-Linie
- Gestapelte Fläche je Spieltag aus der **Zonen-Partition**: Meister ·
  Platz 2–4 (= P(1–4) − P(Meister)) · Platz 5–6 · Mittelfeld (= Rest) ·
  Relegationsplatz · Abstieg. Engine-Helper `zonePartition(targets)` —
  rein, getestet, mit Summe-1-Assertion (Toleranz nur Gleitkomma).
- Farben: `--zone-*`-Tokens plus ein neutraler Mittelfeld-Ton (Token).
  Legende über die geteilte Komponente; Tooltip zeigt alle Bänder mit
  Werten und Δpp.
- BL2 analog aus deren Zielkonfiguration. Frozen-Variante der Karte folgt
  denselben Regeln (Caption unverändert).

### 2.2 „Wo die Saison endet"
- **Y-Achse in %**, Balken in der **Zonenfarbe ihres Platzes** (Legende),
  Tooltip je Balken: „Platz 11 · 9,8 %".

## 3 · Kalibrierung

- **Y-Achse in %**; **Legende** für die zwei Balkenreihen („gesagt" /
  „eingetreten"); **Tooltip je Klasse**: Klassenbereich, n, gesagt,
  eingetreten, Differenz in Pp. (`points()`).
- Der verankerte Leitsatz und die Stichproben-Ehrlichkeit bleiben
  unangetastet.

## 4 · Modellgüte-Zeitreihen — auf WM-Niveau

### 4.1 Treffsicherheit über die Zeit
- Kumulative Linie wie bisher, **plus blasse Punkte je Spieltag**
  (nur dieser Spieltag — „noisy", die Caption sagt es), die
  Zufalls-Referenz (33,3 %) als beschriftete gestrichelte Linie,
  Tooltip (Spieltag, kumulativ, Spieltagswert, n Spiele).

### 4.2 Neue Karte „Brier & Log-Loss über die Zeit"
- Zwei Mini-Charts nach WM-Vorbild: kumulative Kurve, blasse
  Spieltagspunkte, beschriftete Zufalls-Referenz (gleichverteiltes
  Drittel-Tipp: Brier 0,667 / Log-Loss 1,099).
- Engine-Helper `cumulativeSeries(perMatchScores, byMatchday)` — reine
  Aggregation über vorhandene Einzelspiel-Scores, getestet gegen die
  bereits ausgewiesenen Gesamtwerte (letzter Kurvenpunkt ≡ Karte
  „Gesamt").
- Richtungsangabe („niedriger ist besser") sichtbar; Methodik hinter
  „Wie gerechnet?" (stehende Regel greift ohnehin).
- Drei-Provenienzen-Regel gilt: carried-forward-Einträge bleiben aus den
  Kurven ausgeschlossen wie aus den Gesamtwerten (Bestandsmechanik, per
  Test bestätigt).

## 5 · Abnahme

- `ChartTooltip`/`ChartLegend` als einzige Schreiber (Quellwächter);
  Touch- und Tastaturpfad getestet; visually-hidden Inhalte vorhanden.
- Achsen-Scan grün (keine Y-Achse ohne Beschriftung).
- Verlauf: Legende mit Hervorhebung, Tooltip inkl. Top-2-Überraschungen
  (Test mit konstruiertem Spieltag).
- `zonePartition` Summe-1-getestet (beide Ligen); Zonenverteilung ersetzt
  die Titelchance-Linie; Frozen-Variante konsistent; Platzierungs-
  Histogramm mit Achse, Zonenfarben, Tooltips.
- Kalibrierung mit Achse, Legende, Klassen-Tooltips; Leitsatz-Anker
  unverändert.
- Treffsicherheit erweitert; Brier/Log-Loss-Karte mit
  Letzter-Punkt-≡-Gesamt-Test; Referenzlinien beschriftet;
  Provenienz-Ausschluss bestätigt.
- Alles funktioniert unverändert in Archiv-Saisons (Stichproben-
  Rendertest an einer historischen Saison).
- Danach Version **2.3.0**, Tag + Release (deutsche Notes über V2b.1,
  die drei Nachfixe und den Chart-Ausbau) nach stehender Regel;
  CLAUDE.md-Kette und Zustand.
