# Brief — Untertitel + Farbakzente (Addendum zu Brief 13)

**Ergänzt Brief 13: §2.6 dort ist hiermit entschieden, und ein Farbsystem
kommt dazu. Presentation only; Töne als Design-Tokens, Kontrast in beiden
Themes, Farbe nie alleiniger Bedeutungsträger (bestehende A11y-Regel).**

## 1 · Untertitel — entschieden [USER-Wahl getroffen]

Adaption des WM-Untertitels, mit einer bewussten Auslassung: „run live in
your browser" gilt für App A seit Brief 13 §2.4 nicht mehr und wird nicht
übersetzt. Wortlaut:

> Eine Monte-Carlo-Simulation der Bundesliga — rechnet nach jedem Spieltag
> mit den tatsächlichen Ergebnissen neu. Keine einmalige, starre Prognose.

(Inhaltlich das Schaufenster des §0-Satzes im Footer; die beiden dürfen
sich ähneln, das ist Absicht.)

## 2 · Farbakzente — System statt Sprenkel

Drei Token-Familien in `:root` (Light/Dark-Varianten), konsumiert wie
`--measure-text` — keine Einzelfall-Hexwerte in Komponenten; der bestehende
Scan-Stil darf das absichern.

### 2.1 Ausgangs-Farben (Heim / Remis / Auswärts)
`--outcome-home`, `--outcome-draw`, `--outcome-away` (Grün / Gelb / Rot wie
in der WM-App). Anwendung überall, wo eine Tendenz oder ein Ausgang steht:
- die Tendenz-Tripel in `FixturePrediction` („Heimsieg 48 %" grün usw.),
- die Ergebnis-Badges im Spiel-Zeugnis (Heimsieg/Remis/Auswärtssieg),
- die Tendenzspalten auf der Spieltage-Seite.
Semantik: Farbe kodiert **welcher Ausgang**, nie gut/schlecht. Text bleibt
immer daneben.

### 2.2 Vorzeichen-Farben — nur bei eindeutiger Valenz
`--perf-pos` (grün), `--perf-neg` (rot) ausschließlich dort, wo „mehr =
besser" objektiv gilt:
- Leistung vs. Erwartung (Modellgüte und Teams-Seite): Balken grün/rot wie
  im WM-Vorbild.
- **Explizit NICHT** für die Szenarien-Deltas und das Wichtigste Spiel: ein
  „+" auf Abstieg ist für den Klub schlecht — Vorzeichen-Grün/Rot würde dort
  systematisch irreführen. Diese Werte bleiben neutral. Ein Kommentar an
  der Stelle nennt den Grund, damit es niemand später „nachzieht".

### 2.3 Zonen-Farben in der Tabelle
Das Bundesliga-Pendant zu den WM-Podiumsfarben: dezente **Zonen-Akzente**
(linker Randstreifen) in der projizierten Abschlusstabelle und als Punkt vor
den Zonennamen der Platzierungszonen-Karte — Meister/Platz 1–4/Platz 5–6/
Relegationsplatz/Abstieg aus der Zielkonfiguration der Liga (BL2 analog),
mit Legende unter der Tabelle. Konvention wie bei gängigen Tabellen-Grafiken;
keine Fläche, nur Akzent — die Tabelle bleibt ruhig.

## 3 · Abnahme

- Untertitel wörtlich wie §1; der [USER]-Punkt aus Brief 13 ist damit
  geschlossen.
- Tokens vorhanden, beide Themes, Kontrast geprüft; kein Ausgangs-/
  Vorzeichen-/Zonen-Farbwert außerhalb der Tokendatei (Scan).
- Tendenzfarben an den drei genannten Orten über die geteilten Komponenten;
  Performance-Balken grün/rot; Szenarien-Deltas nachweislich ungefärbt
  (Rendertest + Begründungskommentar); Zonenstreifen mit Legende in beiden
  Ligen.
- CLAUDE.md-Kette und Zustand nach stehender Regel (läuft als Teil von
  Brief 13 oder als Brief 14, je nachdem ob 13 schon begonnen ist — CC
  entscheidet nach Stand und vermerkt es).
