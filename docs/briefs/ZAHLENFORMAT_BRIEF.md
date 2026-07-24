# Brief — Zahlenformat + Restprogramm-Schwere

**Small, one PR, presentation only. Systematic fixes from a source review
plus the Restprogramm card; no engine or data change — the UI derives every
new display value from numbers the engine already delivers.**

## 1 · `percent()`: Dezimalstelle wird fest

`pctFmt` nutzt `maximumFractionDigits: 1` ohne `minimumFractionDigits` —
glatte Werte rendern als „5 %", krumme als „13,4 %", jede Prozentspalte
flattert. Fix: `minimumFractionDigits: 1` ergänzen (nur in `pctFmt`;
`pct0Fmt` für `digits = 0`-Aufrufe bleibt). **Unverändert bleibt die
Randwert-Politik des Helpers** — „0 %"/„100 %" nur bei echter Null/Eins,
sonst „<0,1 %"/„>99,9 %"; sie ist Absicht und Teil der Clinch-Ehrlichkeit.
Tests: `percent(0.05) === "5,0 %"`, `percent(0.19) === "19,0 %"`, Randwerte
unverändert.

## 2 · Ein Vorzeichen-Pfad statt drei handgerollter

`signed()` existiert in format.js; daneben leben ein lokales `signedPp`
(Szenarien) und Ternary-Präfixe in Modellgüte und Verlauf (und ggf. weiteren
Stellen — suchen, nicht raten). Nebenwirkung heute: uneinheitliches
Minuszeichen (echtes „−" vs. Bindestrich).

- Neuer kleiner Helper in format.js: `pp(delta, digits = 1)` →
  `signed(delta * 100, digits) + " Pp."` mit echtem „−".
- Alle Prozentpunkt-Anzeigen konsumieren `pp()`; die lokalen Varianten
  entfallen.
- Ein Test rendert einen negativen und einen positiven Delta-Wert über jede
  betroffene Seite und prüft das einheitliche Zeichen; ein Quelltext-Scan im
  Stil der bestehenden Wächter verbietet `" Pp."`-Literale außerhalb von
  format.js.

## 3 · Restprogramm-Schwere: vier Präsentationsfehler

Die §4-Metrik (mittleres Gegner-Rating der Restspiele, Heim/Auswärts
getrennt) bleibt unverändert in der Engine. Die Darstellung hat vier Fehler:

1. **Tausenderpunkt auf Elo-Werten.** „1.678" ist Elo 1678 durch die
   de-DE-Gruppierung. Neuer Formatter `rating(v)` in format.js: ganzzahlig,
   **ohne Gruppierung**; ein Scan-/Testfall verbietet gruppierte Ratings.
2. **Alphabetische Sortierung bei fast identischen Werten.** Sortierung
   **nach Schwere absteigend** (Mittel aus Heim und Auswärts als
   Sortierschlüssel).
3. **Absolute Elo-Mittel sind unlesbar** — Unterschiede von 10–30 Punkten
   auf Basis ~1670 verschwinden optisch. Primär angezeigt wird die
   **Abweichung vom Ligamittel der Gegner** als `signed()`-Wert
   („+12" = schwerer als der Durchschnitt), die absoluten Werte daneben in
   der bestehenden Tabellenform. Reine Darstellung: Engine liefert weiter
   die Mittel; die Differenz bildet die UI aus denselben Zahlen.
4. **Vor dem 1. Spieltag hat die Karte nichts zu sagen — dann sagt sie
   nichts (§7).** Solange für jeden Klub Heim- und Auswärts-Restmenge
   identisch sind (volle Doppelrunde ausstehend), unterscheiden sich die
   Klubs nur durch den Selbstausschluss — arithmetisch erzwungen, ohne
   Spielplan-Information. Die Karte wird in diesem Zustand **verborgen**
   (bestehende Empty-Card-Regel) und erscheint mit dem ersten absolvierten
   Spiel. Die Caption wird ersetzt durch:
   > Mittleres Gegner-Rating der verbleibenden Spiele, als Abweichung vom
   > Durchschnitt: positiv = schwereres Restprogramm. Heim und auswärts
   > getrennt, weil dasselbe Gegner-Rating auswärts schwerer wiegt.

## 4 · Abnahme

- Beide Helper-Tests grün; alle 36 `percent()`-Stellen zeigen eine feste
  Nachkommastelle; kein `" Pp."`-Literal außerhalb format.js; Rendertests der
  betroffenen Tabellen aktualisiert statt gelockert.
- Restprogramm: `rating()` ohne Gruppierung; Schwere-Sortierung; Abweichung
  vom Ligamittel als Primärwert; Karte verborgen, solange alle Restmengen
  Heim = Auswärts sind (Rendertest für beide Zustände: Vorsaison verborgen,
  nach einem gespielten Spiel sichtbar mit divergierenden Spalten); neue
  Caption wörtlich.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
