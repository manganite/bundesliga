# Brief — App B: Spieltag-1-Quotenfix (Ergänzung zum laufenden Transparenz-Brief)

**Enthält nur die neuen Teile: das Gate G1 ist erfüllt, die Diagnose
liegt vor. §2/§3 des laufenden Briefs (Rechenweg, Grundlage-Umschalter)
bleiben unverändert in Arbeit — hier nichts davon doppelt umsetzen.**

## 0 · Fixture [liegt vor]

`tippabgabe-2026-md1.html` committen als
`apps/kicktipp/tests/fixtures/tippabgabe-2026-md1.html` (Personendaten:
keine; die Oddset-Links enthalten nur Kampagnen-Parameter).

## 1 · Diagnose (aus der Fixture, verifiziert)

Kicktipp rendert den Quotenblock in **zwei Varianten**:
- **Variante A** (md2-Fixture): Spans mit Klassen
  `quote-heim/quote-remis/quote-gast`, margenfreie Werte.
- **Variante B** (md1-Fixture): **Oddset-Anker**
  `<a class="quote quoteheim">` (ohne Bindestrich) umschließen
  `quote-label` (1/X/2) und `quote-text`; echte Quoten mit ~5 %
  Overround. Die bestehende Normalisierung entfernt den Aufschlag by
  construction — dort kein Handlungsbedarf.
- Zusätzlich steht der **Gastverein** in Variante B als
  `stackElement[data-from="2"]` in col1; col2 ist leer.

## 2 · Fix

- **Quoten-Zuordnung primär über `quote-label`** („1"/„X"/„2") — in
  beiden Varianten vorhanden und semantisch stabil; Fallback: beide
  Klassenschreibweisen (`quote-heim` UND `quoteheim` usw.); fehlt
  beides → Zeilen-Meldung im Panel, fail-closed.
- **Gast:** `stackElement[data-from="2"]` bevorzugt, sonst col2-Text —
  spiegelbildlich zur Heim-Logik.
- **Fehlersichtbarkeit je Zeile** (falls im laufenden Brief noch nicht
  umgesetzt, gehört sie hierher): Spiele ohne lesbare Quoten werden an
  ihrer Zeile mit Grund gemeldet („Wettquoten nicht gefunden — dieses
  Spiel läuft im Nur-Modell-Modus"), Vorschlagstabelle zeigt dort
  „Grundlage: Modell". Gemischte Spieltage sind erste Klasse.

## 3 · Tests

- **Beide Fixtures parsen mit EINER Extraktion vollständig** — md1:
  9 Spiele, Zeile 1 wortgenau (FC Bayern München – VfB Stuttgart,
  Punkteregel 3-9-9, Odds 1.32/6.50/7.25, id 1503034386); md2:
  Bestandstests unverändert grün.
- Overround-Test: md1-Quoten normalisieren zu Summe 1.
- Konstruierte Zeile ohne Quotenblock → Zeilen-Hinweis + Grundlage
  Modell; gemischter Spieltag getestet.
- Sicherheits-/Bestandstests und Ein-Datei-Nachweis unverändert.

## 4 · Abnahme

[USER]-Gegenprobe: 1. Spieltag einfügen → Panel zeigt 9 Spiele MIT
Quoten. Kein Release-Bump (App B wird nicht deployt); CLAUDE.md-Kette
und Zustand nach stehender Regel.
