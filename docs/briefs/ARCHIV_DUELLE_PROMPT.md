# Prompt — Archiv-Presets: Bereichsregel + historische Duelle

**Kleiner PR vor dem 2.3.0-Release. Keine Simulation, keine Artefakt-
Regeneration: die historischen Duelle werden aus den vorhandenen
Timeline-Artefakten abgeleitet, über die bestehende `directDuels`-Funktion
— eine Implementierung, zwei Datenquellen.**

## 1 · Bereichs-Anwendbarkeit statt Archiv-Sonderfall

- **Regel:** Ein Bereich, der im aktuellen Datenstand null Spiele träfe,
  wird im Menü nicht angeboten. Das erledigt „alle offenen Spiele" im
  Archiv und „alle gespielten Spiele" vor dem 1. Spieltag gleichermaßen.
- **Umbenennung:** Trifft „alle gespielten Spiele" sämtliche Spiele der
  Saison (Archivfall), lautet der Eintrag **„Alle Spiele"**.
- Test: Archiv zeigt genau „Alle Spiele" (weder „offene" noch
  „gespielte"); Vorsaison zeigt keine „gespielten"; Mittsaison zeigt
  beide.

## 2 · Historische Duelle aus der Timeline ableiten

### 2.1 Ableitung
Engine-seitige Ableitungsfunktion (dünner Adapter, keine neue Metrik):
für Spieltag M der Archiv-Saison werden die Spiele des Spieltags M mit den
Zielwahrscheinlichkeiten des **Timeline-Punkts M−1** (Punkt 0 =
Saisonstart) durch die **bestehende `directDuels`-θ-Regel** geschickt —
gleiche Funktion, gleicher θ-Default (10 %), gleiche Mehrfachziel-
Semantik. Ein Test konstruiert einen Datenstand, auf dem Live-Pfad und
Archiv-Ableitung dieselbe Eingabe sehen, und verlangt identische Ausgabe.

### 2.2 Konsumenten (alle über die bestehende geteilte Markierung)
- **Szenarien:** Bereich „Direkte Duelle" existiert im Archiv wieder und
  bedeutet die **Vereinigung über alle Spieltage** — genau die „wichtigen
  Spiele" der Saison. Zeilen-Markierung (Streifen + Chip) am jeweiligen
  Spieltag wie im Live-Fall.
- **Spieltage:** Markierung der Duelle des angezeigten Spieltags.
- **Duelle-Karte (Tabelle & Prognose):** rendert im Archiv die
  Saison-Duelle in den bestehenden Ziel-Tabs; die Spieltag-Spalte
  existiert bereits. Sortierung im Tab: Spieltag aufsteigend (die Saison
  als Erzählung), `min(P)`-Zweitschlüssel.

### 2.3 Caption — die §8-Feinheit, verankert
Archiv-Fassung der Duell-Caption:
> Spiele, bei denen beide Klubs vor dem Spieltag mindestens 10 % Chance
> auf dasselbe Ziel hatten — nach der retrospektiven Modellrechnung mit
> den heutigen Parametern, nicht nach damaliger Einschätzung.
Verankerungstest; die Live-Caption bleibt unverändert.

## 3 · Abnahme

- Bereichsregel per Test in allen drei Zuständen (Archiv / Vorsaison /
  Mittsaison); „Alle Spiele"-Umbenennung greift nur im Vollfall.
- Ableitungs-Äquivalenztest grün; Duelle erscheinen im Archiv an allen
  drei Orten (Rendertests: Szenarien-Bereich wendet auf die Vereinigung
  an; Spieltage-Markierung am Beispielspieltag; Karte mit Tabs und
  Spieltag-Sortierung).
- Archiv-Caption verankert; Live-Verhalten unverändert (Bestandstests).
- Danach Release **2.3.0** über V2b.1 + beide Nachfixe, Tag + Release
  nach stehender Regel — sofern das laufende Review ([USER], Punkt 2:
  Plots) nichts weiter vorzieht.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
