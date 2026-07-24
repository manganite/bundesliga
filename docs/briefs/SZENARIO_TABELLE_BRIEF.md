# Brief — Szenario-Schlusstabelle, Anwenden & rechnen, gemeinsame Ligatabelle

**Vor dem 2.2.0-Release; das Release umfasst danach Brief 16 + 17. Keine
neue Engine-Berechnung: Realspalten via bestehendem `rankTable` auf dem
transformierten Datenstand, Erwartungswerte aus den vorhandenen
Worker-/Artefakt-Aggregaten (falls der Worker sie noch nicht ins Ergebnis
reicht: durchreichen, nicht neu rechnen).**

## 1 · „Anwenden & rechnen"

Der Preset-Button heißt **„Anwenden & rechnen"** und tut beides: Zustände
füllen, Meldungszeile zeigen, Simulation starten. Kein stiller Autolauf —
der Button sagt, was er tut; die Regel aus dem UX-Brief (manuelle
Änderungen rechnen nie von selbst) bleibt unberührt: Einzeländerungen nach
einem Preset dimmen wie bisher und brauchen „Szenario rechnen".

## 2 · Schlusstabelle über der Detailanalyse

### 2.1 Inhalt und Datenquellen
Oberhalb der Veränderungs-Tabs steht die **simulierte Schlusstabelle** des
Szenarios, im Aufbau der Tabelle-&-Prognose-Tabelle: #, Klub, Sp, Tore,
Diff, Pkt (aus `rankTable` auf dem **transformierten** Datenstand —
festgesetzte und freigegebene Spiele wirken hier sichtbar), erw. Pkt und
10–90 %-Band (aus dem Szenariolauf), Zonenstreifen und Legende wie gehabt,
geteilte Plätze nach Spielordnung, innerhalb geteilter Plätze Reihenfolge
nach erw. Pkt (bestehende Konvention samt Caption).

### 2.2 Der Veränderungs-Indikator
Neue schmale Spalte neben dem Rang: **„↑2" / „↓1" / „·"** — Verschiebung
der Position in der Erwartungs-Reihenfolge gegenüber der Basis, als Pfeil
**mit Platzzahl** (Text, nicht nur Farbe — A11y-Regel). Zweitsignal:
Intensität des Pfeils skaliert mit |Δ erw. Pkt|; `title` nennt beide
Zahlen („2 Plätze auf, +4,3 erwartete Punkte"). Vorzeichenfarben sind hier
zulässig: „rauf" ist für den Klub eindeutig gut — der
Begründungskommentar grenzt zum Delta-Färbeverbot der Wahrscheinlichkeits-
Tabs ab, das unverändert gilt.

### 2.3 Basis-Semantik — CRN-ehrlich
- **Vor dem ersten Rechnen** zeigt die Tabelle die Standardwerte aus dem
  kanonischen Artefakt (20 000 Läufe), ohne Indikatorspalte; sie ist dann
  inhaltsgleich mit Tabelle & Prognose, und die Caption sagt das („noch
  kein Szenario — Standardprognose").
- **Nach dem Rechnen** vergleicht der Indikator gegen die **gepaarte
  2 000-Läufe-Basis** desselben Laufs (CRN), nie gegen das Artefakt —
  sonst stünde Stichprobenrauschen als Pfeil in der Tabelle. Caption-
  Halbsatz: „Vergleich gegen die unveränderte Prognose, gleiche
  Zufallszahlen." Der Veraltet-Mechanismus dimmt Tabelle und Tabs
  gemeinsam.

## 3 · Eine Ligatabelle, drei Konsumenten

Extraktion einer geteilten **`LeagueTable`**-Komponente (Ein-
Implementierungs-Nachweis wie gehabt) mit optionalen Spaltengruppen:
1. **Spieltage** („Tabelle nach dem N. Spieltag"): Realspalten inkl.
   **Tore** und Diff, Zonenstreifen + Legende, geteilte Plätze — keine
   Prognosespalten. Damit endet der V1-Rückstand dieser Tabelle.
2. **Tabelle & Prognose**: wie heute, nun über die geteilte Komponente.
3. **Szenario-Schlusstabelle**: wie 2. plus Indikatorspalte (§2.2).
Flaggen-Marker (Carry-forward) und Zonenlogik leben einmal in der
Komponente.

## 4 · Abnahme

- „Anwenden & rechnen" startet den Lauf (Test); manuelle Änderung danach
  dimmt und rechnet nicht von selbst (Bestandstest bleibt).
- Schlusstabelle: Realspalten reagieren auf festgesetzte/freigegebene
  Spiele (Test mit umgeschriebenem gespielten Spiel); Indikator korrekt
  für ↑/↓/·, mit Platzzahl im Text und beiden Werten im `title`;
  Basiswechsel Artefakt → gepaarte 2 000er-Basis getestet; Vorsaison-
  Zustand zeigt Standardwerte ohne Indikator.
- `LeagueTable` einmal implementiert, drei Konsumenten (Quellwächter);
  Spieltage-Tabelle mit Toren, Diff, Zonenstreifen, Legende (Rendertest).
- Keine neuen Engine-Berechnungen (höchstens Durchreichen vorhandener
  Aggregate im Worker-Ergebnis, getestet als Identität zu den
  Artefaktwerten bei unverändertem Datenstand und gleicher Laufzahl).
- Danach: Version 2.2.0, Tag + Release mit deutschen Notes über Brief
  16 + 17, nach stehender Regel; CLAUDE.md-Kette und Zustand; läuft als
  Brief 17.
