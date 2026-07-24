# Brief — Szenario-Presets, Freigeben, Duell-Hervorhebung

**Ein Brief, drei Teile. Ein neues Primitiv (Freigeben), ein Bedienelement
(Preset-Leiste), eine seitenübergreifende Markierung. Engine-Änderungen:
genau EIN reiner Helper (§2.3, `regionModal`) — sonst keine; das Freigeben
ist eine Datenstands-Transformation in der UI-Schicht, der Worker und alle
Schlüssel bleiben unberührt. Szenarien bleibt die einzige Seite mit
analytischer Interaktion.**

## 1 · Das neue Primitiv: Freigeben

Bisher kennt das Was-wäre-wenn nur offene Spiele. Neu: **auch gespielte
Spiele erscheinen in der Spieltagsliste** und können behandelt werden.
Zustände je Spiel:

- offen: **simuliert** (wie bisher) oder **festgesetzt**
- gespielt: **real** (Default; zeigt das Ergebnis), **freigegeben** (wird
  simuliert wie ein offenes Spiel) oder **festgesetzt** (anderes Ergebnis)

Darstellung gespielter Spiele im Szenario-Zustand: das reale Ergebnis
bleibt klein sichtbar („statt real 2:1"), damit jederzeit ablesbar ist, was
überschrieben wurde. Mechanik: vor dem Worker-Aufruf transformiert die
Seite den Datenstand (freigegeben → beide Tore entfernt, festgesetzt →
Nutzer-Ergebnis) — **kein Engine-Eingriff**, die Fixture-Schlüssel sind
datenstandsunabhängig, CRN gegen die unveränderte Basis gilt unverändert,
der Halbdefiniert-Guard bleibt scharf (es werden immer beide Tore entfernt
oder gesetzt). „Szenario rechnen" und der Veraltet-Mechanismus unverändert.

**Ehrlichkeitspflicht (Caption, ein Satz, verankert):** „Ratings spulen
nicht zurück — auch bei geänderten früheren Ergebnissen rechnet die
Simulation mit den Ratings des aktuellen Datenstands." Benannte
Approximation nach dem Muster der Relegations-Marginalapproximation.

## 2 · Die Preset-Leiste: Bereich × Rezept

Ein Bedienelement über der Spielliste: zwei Wahlfelder plus „Anwenden".
Presets **füllen** Zustände in der Liste — sie sind nichts, was man nicht
auch von Hand könnte, und alles bleibt danach editierbar.

### 2.1 Bereiche
Alle offenen Spiele · alle gespielten Spiele · ein Spieltag · ein Verein
(Wähler) · **Direkte Duelle** (die bestehende θ-Liste des Artefakts).

### 2.2 Rezepte (Definitionen sind Vertrag, Captions nennen sie)
1. **Wie prognostiziert** — Festsetzen auf `favouriteScoreline` (bedingtes
   Modalergebnis der Favoritentendenz; existiert).
2. **Absolut wahrscheinlichstes Ergebnis** — Festsetzen auf das globale
   Modalergebnis (die in Brief 11/Methodik erklärte Unterscheidung wird
   hier zum Feature; oft ein Remis, die Caption verweist auf Methodik
   Schritt 2).
3. **Verein gewinnt alles** — Rezept mit Klub-Parameter: in jedem Spiel des
   Klubs (Schnittmenge mit dem Bereich) Festsetzen auf das Modalergebnis
   **innerhalb der Siegregion dieses Klubs** (§2.3).
4. **Nur Überraschungen** — Festsetzen auf das Modalergebnis innerhalb der
   **unwahrscheinlichsten Tendenz**. Definition ausgesprochen in der
   Caption: „Überraschung = der aus Modellsicht unwahrscheinlichste
   Ausgang, mit dessen wahrscheinlichstem Ergebnis."
5. **Neu auswürfeln** — offene Spiele: zurück zu simuliert; gespielte:
   freigeben.

### 2.3 Der eine erlaubte Engine-Helper
`regionModal(matrix, region)` — Modalergebnis innerhalb einer benannten
Region (heim/remis/auswärts), Ties über die kanonische Ordnung.
`favouriteScoreline` wird intern darauf umgestellt (eine Implementierung).
Rein, getestet inkl. Tie-Fall.

### 2.4 Transparenz
Jede Anwendung meldet in einer Zeile, was sie tat („27 festgesetzt,
5 freigegeben, 2 unverändert — Spiele ohne eindeutiges Rezeptergebnis
bleiben unberührt"). Presets stapeln: eine zweite Anwendung überschreibt
nur ihren Bereich. „Alles zurücksetzen" räumt weiterhin komplett.

## 3 · Duell-Hervorhebung (Was-wäre-wenn-Liste + Spieltage-Seite)

- **Eine geteilte Quelle:** ein Selector `duelTargets(fixtureId)` über die
  θ-Duell-Liste des Artefakts — dieselben Daten wie die Duelle-Karte, keine
  zweite Berechnung.
- **Markierung:** dezent aufgehellter Zeilenhintergrund **plus**
  Zonen-Randstreifen in der Ziel-Farbe (Tokens aus Brief 14) **plus** ein
  kompakter Chip mit dem Ziel („Abstiegsduell", „Duell um Platz 1–4") —
  Farbe nie alleiniger Träger (bestehende Regel). Mehrere Ziele: Chip zeigt
  das ranghöchste (Konfigurationsreihenfolge), `title` nennt alle.
- Je Seite ein Caption-Halbsatz: „Hervorgehoben: direkte Duelle (beide
  Klubs ≥ 10 % auf dasselbe Ziel)."

## 4 · Abnahme

- Freigeben: Rendertest aller drei Gespielt-Zustände inkl. „statt real"-
  Anzeige; Transformationstest (freigegeben ⇒ beide Tore entfernt; Guard
  feuert nie); CRN-Test: unberührte Spiele tragen 0 zur Differenz bei,
  auch bei freigegebenen Nachbarn.
- Presets: je Rezept ein Definitionstest (u. a. Überraschung, wenn das
  Remis die unwahrscheinlichste Tendenz ist); Meldungszeile mit korrekten
  Zählern; Stapel-Semantik getestet.
- `regionModal` getestet; `favouriteScoreline` delegiert nachweislich.
- Duell-Markierung aus einer Quelle an beiden Orten (Ein-Implementierungs-
  Nachweis); Chip + Streifen + Hintergrund vorhanden; Mehrfachziel-Fall
  getestet; Caption-Halbsätze da.
- Ehrlichkeits-Captions (Ratings spulen nicht zurück; Überraschungs-
  Definition) per Verankerungstest.
- Keine weiteren Engine-/Pipeline-/Artefaktänderungen; 2 000 Läufe fix;
  CLAUDE.md-Kette und Zustand; läuft als Brief 16.
