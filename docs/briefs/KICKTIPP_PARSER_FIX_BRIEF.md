# Brief — App B: Parser gegen das echte Kicktipp-Markup

**Grundlage: die echte Tippabgabe-Seite (2. Spieltag 2026/27), verifiziert —
Kicktipp rendert die Zeile als responsiven „Stack": die Heimzelle (col1)
trägt Klubname, Punkteregel („3 - 9 - 9") UND die Wettquoten
(`quote-heim/remis/gast`-Spans, Dezimalpunkt), während die dafür benannten
Spalten col3/col5 leer und versteckt sind. Der bisherige Eine-Zahl-je-Zelle-
Parser konnte das strukturell nie sehen. Der positionsbasierte Zahlenansatz
entfällt ersatzlos — er war zudem die Quelle der Gefahr, Punkteregel-Quoten
als Wettquoten zu lesen; die Struktur unterscheidet beides frei Haus.**

## 0 · Fixture zuerst

Die Datei liegt bei [USER] unter `Downloads/tippabgabe-2026-roh.html`.
Committen als `apps/kicktipp/tests/fixtures/tippabgabe-2026-md2.html`
(Personendaten: keine gefunden; Formular-IDs dürfen bleiben). Sie ist ab
jetzt die maßgebliche Parser-Referenz; die alten synthetischen Fixtures
bleiben nur, soweit sie Sicherheits-/Negativfälle tragen.

## 1 · Struktureller Parser (ersetzt die Zahlenheuristik vollständig)

Je `tr.datarow` (Container: `table#tippabgabeSpiele`, aber tolerant, falls
die Tabelle ohne id eingefügt wird — Erkennung über die Zeilenstruktur):
- **Heim:** Text des `stackElement[data-from="1"]` in col1; Fallback:
  reiner Zellentext, falls kein Stack existiert.
- **Gast:** Text col2 (gleicher Fallback-Mechanismus).
- **Wettquoten:** die drei `.quote-text`-Werte in Reihenfolge
  heim/remis/gast aus `.tippabgabe-quoten`; Zahlen mit Punkt ODER Komma.
  **Fehlen sie ganz** (Runde ohne Quotenanzeige): Fixture ohne odds —
  App läuft im **Nur-Modell-Modus** (der bestehende market-Fallback), mit
  sichtbarem Hinweis „ohne Wettquoten — Empfehlungen rein aus dem Modell".
- **Punkteregel:** das `stackElement[data-from="3"]` bzw. col3, Muster
  `N - N - N` (je 3–9). Fehlt sie: manuelle Eingabe wie bisher.
- **Spiel-ID:** aus `spieltippForms[<id>]` — stabiler Schlüssel für die
  Anzeige.
- `tr.rowheader` (Datumszeilen, colspan) werden übersprungen.
- **Fail-closed je Zeile:** Ein Klubname ohne Register-Zuordnung oder eine
  unvollständige Zeile wird namentlich als „nicht verwertet" gemeldet —
  nie geraten. Die verwerteten und verworfenen Zeilen erscheinen im Panel
  (§3).

## 2 · Klub-Register: Kicktipp-Namensformen

Die Seite nutzt eigene Formen („Bor. Mönchengladbach", „1899 Hoffenheim",
„FSV Mainz 05", „Werder Bremen" …). Diese Formen kommen als dritte
Namensspalte ins generierte Register (BL1 + BL2, alle 36); unbekannte
Namen bleiben fail-closed. Quelle: die Fixture plus der öffentliche
Kicktipp-Spielplan für die Klubs, die am 2. Spieltag nicht vorkommen —
KEINE weiteren Kicktipp-Abrufe durch die App selbst (die Regel „manual
paste only" bleibt wörtlich in parse.mjs stehen).

## 3 · Einfügepfad + „Das habe ich verstanden"

- **Paste-Event liest `text/html`** aus der Zwischenablage (damit
  funktioniert künftig auch Strg+A/Strg+C auf der Seite selbst);
  Klartext-Markup im Textfeld (der DevTools-outerHTML-Weg) funktioniert
  weiterhin — beide Pfade landen im selben Parser.
- Liefert die Zwischenablage nur gerenderten Text ohne Markup: klare
  Anleitung statt stillem Scheitern („Bitte die Seite kopieren, nicht nur
  den Text — oder in den DevTools das Tabellen-HTML kopieren.").
- **Panel nach jedem Einfügen:** n Spiele erkannt, je Zeile
  Heim – Gast · Punkteregel · Wettquoten (oder „ohne"), plus die
  verworfenen Zeilen mit Grund. Erst wenn das Panel stimmt, rechnet man —
  das ist Stufe 2 des Testplans, in die App eingebaut.
- **Datenstand-Stempel** prüfen/ergänzen: die App zeigt sichtbar, von wann
  ihre eingebetteten Ratings sind (Bauzeit-Stempel wie App A).

## 4 · Tests

- Fixture-Parse: exakt 9 Spiele; Zeile 1 wortgenau asserted
  (VfB Stuttgart – 1. FC Köln, Punkteregel 3-9-9, Odds 1.11/18.9/22.0,
  id 1503034643); alle 9 Paarungen und IDs.
- Zahlformate: Punkt und Komma; Punkteregel-Muster-Grenzen.
- **Konstruierter Verwechslungstest:** eine Zeile, die nur die
  Punkteregel trägt, darf niemals odds liefern (der alte Fehlermodus als
  permanenter Regressionstest).
- Nur-Modell-Modus: Fixture-Variante ohne Quoten-Spans → odds null,
  Hinweis gerendert, Optimierung läuft.
- Unbekannter Klub → Zeile gemeldet, nicht geraten.
- Sicherheitstests (Script-/Handler-Injektion, Verwerfen statt
  Bereinigen) laufen unverändert gegen den neuen Parser.
- CI-Build (Ein-Datei-Nachweis) unverändert.

## 5 · Abnahme

- Fixture committet; Parser strukturell; Zahlenheuristik entfernt;
  Panel + Paste-Pfad + Hinweistexte; Register um Kicktipp-Formen ergänzt;
  alle Tests aus §4 grün; „manual paste only" unangetastet.
- Danach [USER]-Gegenprobe: echte Seite per Strg+A/Strg+C einfügen —
  Panel muss die 9 Spiele des aktuellen Spieltags zeigen. Das ist der
  Abschluss von Stufe 2 des Testplans; Stufe 3/4 (Plausibilität,
  Parallellauf) folgen ab dem 1. Tippspieltag.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
