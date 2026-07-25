# Prompt — Duelle-Karte: Ergebnisse, und gespielte Duelle bleiben sichtbar

Kleiner PR vor dem 2.3.0-Release. Kein Engine-Eingriff: die Ableitung gespielter Duelle
existiert seit dem Archiv-Fix (Timeline-Punkt M−1 → directDuels); das Ergebnis ist ein
Daten-Join auf die Saison-Fixtures.

## 1 · Die Karte zeigt beide Welten (Tabelle & Prognose)

Je Ziel-Tab zwei Abschnitte:

- „Anstehend" — wie bisher: verbleibende Duelle aus dem Outlook, Brisanz-Sortierung
  (min(P) absteigend, Spieltag-Zweitschlüssel). Der Abschnittstitel ist zugleich der
  gewünschte Offen-Hinweis; die Zeilen bleiben unverändert.
- „Gespielt" — die bisherigen Duelle dieser Saison aus der Timeline-Ableitung (Spieltag
  absteigend, jüngste zuerst), jede Zeile mit dem Endergebnis („2:1", Heim zuerst,
  konsistent zur Klub-Reihenfolge der Zeile). Die Pre-Match-Prozente bleiben stehen —
  genau der Vergleich, den die Änderung will: was auf dem Spiel stand, und wie es ausging.
- Leere Abschnitte rendern nicht (§7): Vorsaison zeigt nur „Anstehend", das Saisonende
  nur „Gespielt". Archiv unverändert chronologisch aufsteigend — dort kommt lediglich die
  Ergebnisspalte hinzu.
- Tab-Zähler = Summe beider Abschnitte.

## 2 · Caption, erweitert und verankert

Live-Fassung ergänzt um einen Satz: „Gespielte Duelle sind nach dem Rechnungsstand vor
ihrem jeweiligen Spieltag bestimmt; die Prozente sind die von damals, das Ergebnis das
echte." Archiv-Caption aus dem letzten Fix bleibt unverändert. Beide verankert.

## 3 · Abnahme

- Rendertests: konstruierter Mittsaison-Stand mit beiden Abschnitten (Sortierungen je
  Abschnitt geprüft); Vorsaison nur „Anstehend"; Archiv chronologisch mit Ergebnissen;
  Tab-Zähler = Summe.
- Ergebnis-Join getestet (Heim-zuerst-Konsistenz mit der Klub-Reihenfolge der Zeile).
- Caption verankert; Szenarien-/Spieltage-Markierung unberührt (Bestandstests).
- Danach Release 2.3.0 über V2b.1 + die drei Nachfixe, Tag + Release nach stehender Regel.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
