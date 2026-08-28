# Brief — Halbserien-Paket: Herbstmeister, Halbzeitbilanz, Drei-Anker-Vergleich

**Erste Substanzänderung seit der Kernphase (Engine-Tally), plus App-Ausbau.
Umsetzung NACH dem ersten BL2-Wochenende — die Einfrier- und
Vollständigkeitslogik verdient erst Produktionsbeobachtung mit ruhigen
Händen. Version: 2.4.0 (Feature).**

## 0 · Architektur-Zusagen vorab

- **Kein Protokoll-Bump.** Das neue Tally LIEST die gezogenen Ergebnisse;
  die Ziehung und alle CRN-Schlüssel bleiben unberührt. Zusage als Test:
  Nach Einbau des Tallys sind alle bestehenden Artefakt-Zahlen (Outlook-
  Wahrscheinlichkeiten, Timeline-Punkte) **bitidentisch** zu vorher —
  es kommen nur Felder hinzu.
- engineVersion-Bump; Artefaktschema erweitert; **einmalige Regeneration
  der Historien-Artefakte** (Batch ~1 h, deterministisch), damit das
  Archiv den Herbstmeister rückwirkend kennt.
- Zustandslogik der neuen Ansichten hängt an der **kumulativen
  Vollständigkeitsregel** aus Brief 31: „nach der Hinrunde" existiert
  genau dann, wenn Timeline-Punkt 17 existiert. Keine zweite Definition.

## 1 · Engine: Herbstmeister-Tally

Je Simulationslauf wird der Tabellenstand nach Spieltag 17 mit dem
DFL-Ranker bestimmt (reale Ergebnisse der Spieltage ≤ 17 plus die im
Lauf gezogenen); der Führende ist der Herbstmeister dieses Laufs.
Ergebnis: `P(Herbstmeister)` je Klub, in Outlook UND Timeline-Punkten
(gleicher Simulationspfad → gleiches Schema überall). Nach vollständigem
Spieltag 17 kollabiert die Größe auf den Fakt — der Ranker auf den
realen Ergebnissen liefert ihn; kein Sonderpfad.

## 2 · Halbserien-Grundlagen (App, reale Daten — kein Engine-Bezug)

- **Tabelle & Prognose:** Umschalter Gesamt / Hinrunde / Rückrunde für
  die REALE Tabelle (rankTable auf Spieltag ≤ 17 bzw. ≥ 18). Die
  projizierte Endtabelle bleibt Gesamt — projizierte Halbserien-Tabellen
  sind bewusst NICHT im Paket (eigenes Tally, eigener Anlass).
- **Teams:** Bilanz je Halbserie (Spiele, Punkte, Tore) neben der
  bestehenden Gesamtbilanz.
- **Verlauf + Teams-Charts:** vertikaler Halbserien-Marker bei
  Spieltag 17 (bestehende Chart-Infrastruktur; ein gemeinsames Element,
  Ein-Implementierungs-Wächter).

## 3 · Herbstmeister im UI

- **Übersicht, Titelrennen-Karte:** eine Zeile `P(Herbstmeister)` für
  den Führenden (+ eigenen Wert im Detail), sichtbar solange Spieltag 17
  nicht vollständig ist; danach als Fakt („Herbstmeister: X"). Karte
  bleibt eine Karte — keine neue.
- **Archiv-Saisonbilanz:** Herbstmeister als Fakt, daneben seine
  damalige Wahrscheinlichkeit zum Saisonstart (Timeline-Punkt 0) — der
  „war das absehbar?"-Blick.
- Verlauf-Ziel `Herbstmeister` (Kurve über die Hinrunde) ist **bewusst
  zurückgestellt** — die Daten entstehen durch §1 nebenbei; die
  UI-Aufnahme ist ein eigener, kleiner Folgeschritt, falls gewünscht.

## 4 · Halbzeitbilanz [erscheint, sobald Punkt 17 existiert]

Ein Abschnitt auf **Modellgüte** („Halbzeitbilanz"), drei Bausteine:
1. **Modellgüte je Halbserie:** Treffsicherheit, Brier/Log-Loss der
   Hinrunde separat (Filterung der bestehenden per-Spiel-Daten;
   Richtungs- und Baseline-Angaben nach §4-Regeln der Kernbriefe).
2. **Größte Überraschungen der Hinrunde:** die bestehende
   Surprisal-Topliste, gefiltert auf Spieltag ≤ 17.
3. **Prognose-Vergleich Saisonstart ↔ nach der Hinrunde:** je Klub die
   Zielwahrscheinlichkeiten an Anker 0 und Anker 17 nebeneinander
   (Timeline-Daten; Darstellung als Paar-Balken oder Pfeiltabelle,
   geteilte Komponenten). Caption nach §0-Wortlaut v5: „Die Prognose
   verändert sich durch neue Ergebnisse und aktualisierte Ratings" —
   beschreibend, keine Zerlegung.

## 5 · Rückrunden-Entwicklung [während der Rückrunde wachsend]

**Teams** (je Klub) und **Modellgüte** (Liga-Überblick):
Über-/Unterperformance **je Halbserie** — reale Punkte minus erwartete
Punkte aus den Pre-Match-Prognosen der jeweiligen Halbserie, normiert
je Spiel (bestehende Metrik, gefiltert), plus die Differenz Rückrunde −
Hinrunde als „Entwicklungs"-Spalte.

**Der Ehrlichkeits-Anker dieses Pakets, als Pflicht-Caption und Test:**
> „Die Erwartung lernt mit: Die Rückrunden-Prognosen kennen die
> Hinrunde bereits (Live-Ratings). Ein Klub, der in der Hinrunde
> überraschte und in der Rückrunde seine NEUE Erwartung erfüllt, zeigt
> hier keinen Einbruch — gemessen wird Leistung relativ zur jeweils
> aktuellen Erwartung, nicht Punkteform."
Ohne diesen Satz erzählt die Ansicht Regression zur Mitte als
„Formeinbruch". Begriffe wie „Form" werden in den UI-Texten vermieden;
es heißt „über/unter Erwartung".

## 6 · Saison-Abschluss: Drei-Anker-Vergleich [Saison vollständig]

Auf **Verlauf** (es sind Timeline-Anker) ein Abschnitt „Saisonbilanz":
je Klub und je Ziel die Werte an Anker 0 (Saisonstart), Anker 17
(nach der Hinrunde) und das reale Ergebnis — Liga-Gesamtsicht als
Tabelle, Klub-Detail über den bestehenden Selektor. Im **Archiv sofort
für alle Saisons verfügbar** (dort ist jede Saison vollständig);
Retrospektiv-Label und In-sample-Caption nach stehender Regel. Für die
laufende Saison erscheint der Abschnitt erst mit Punkt 34.

## 7 · Platzierung und Zustände

- Metrik-Platzierungsregel eingehalten: Halbserien-Performance lebt auf
  Teams (Klub) und Modellgüte (Liga) — nirgends sonst; die
  Übersicht zeigt höchstens Namen mit Link (bestehendes Muster).
- Alle neuen Abschnitte verschwinden, wenn ihr Zustand nicht erreicht
  ist (leere Karten verstecken sich — Kernregel).
- Saisonabhängigkeit: Spieltag-17-Grenze gilt für 18er-Ligen; die
  Grenze kommt aus der Saisonkonfiguration, nie als Konstante
  (Langlebigkeitsregel §5.6/§6 v5).

## 7b · Geltung für die 2. Bundesliga — ENTSCHIEDEN: beide Ligen

Der Kernbrief führte `Herbstmeister` nur in der BL1-Zielliste; **das ist
hiermit auf beide Ligen erweitert** (Nutzer-Entscheidung 28.08.). Gleicher
Codepfad — das Tally kennt keine Liga; die Halbserien-Grundlagen (§2)
gelten ohnehin für beide. Die Zielliste der Saisonkonfiguration führt
`Herbstmeister` damit in BL1 UND BL2; UI-Wortlaut in der 2. Liga:
„Herbstmeister" unverändert (etablierter Sprachgebrauch, kein
Sonderbegriff).

## 8 · Tests

- **Bitidentität:** Artefakte vor/nach Tally-Einbau — alle bestehenden
  Felder byteidentisch (der §0-Anker).
- Tally: konstruierte Mini-Liga, Herbstmeister je Lauf gegen
  Handrechnung; Kollaps auf Fakt nach vollständigem Spieltag 17;
  Tiebreak am Anker per DFL-Ranker (nicht Punktgleichheit raten).
- Halbserien-Tabellen: rankTable-Filterung gegen bekannte
  Halbserien-Endstände einer Archivsaison.
- Vollständigkeits-Kopplung: Punkt 17 fehlt (Nachholspiel) →
  Halbzeitbilanz und Herbstmeister-Fakt erscheinen NICHT; Punkt fällt →
  beides erscheint (Wiederverwendung der Brief-31-Testfixtures).
- Ehrlichkeits-Caption §5 verankert (Scan/DOM); „Form" kommt in
  UI-Strings nicht vor (Wortscan wie „entrandet").
- Grenzfall-Zeile: die Spieltag-17-Grenze bekommt ihre Zeile in
  `grenzfaelle.md` samt Randtests (Pflichtzeile aus CLAUDE.md).
- Regeneration: eine Archivsaison doppelt gebaut → bitgleich; Stichprobe
  eines bekannten historischen Herbstmeisters korrekt.

## 9 · Abnahme

- Alle §8-Tests grün, Suite ohne Skips; Regeneration committet;
  2.4.0 mit Tag + Release (Notes in Nutzersprache: „Die App kennt jetzt
  Halbserien …").
- [USER]-Gegenprobe: Übersicht zeigt Herbstmeister-Zeile; Archivsaison
  zeigt Saisonbilanz mit drei Ankern; ein Klub mit bekannter
  Hinrunden-Überraschung (z. B. aus 2025/26) liest sich in §5 korrekt
  „relativ zur Erwartung".
- CLAUDE.md-Kette, Zustand, Brief-Index — nach stehender Regel.
