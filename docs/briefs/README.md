# Die Vorgaben

Hier liegen die Briefe, nach denen dieses Projekt gebaut wurde — in der
Reihenfolge, in der sie entstanden sind. **Die jeweils spätere schlägt die
frühere.** Wo eine verifizierte Primärquelle allen widerspricht, gilt die Quelle
(siehe [../verification/](../verification/)).

Die Dateinamen verraten diese Reihenfolge nicht: alphabetisch sortiert stünde das
Addendum vor dem Erratum, das es ergänzt. Deshalb dieser Index.

| # | Datei | Was sie regelt |
|---|---|---|
| 1 | [BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md](BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md) | Die Grundvorgabe: Modell, Simulationsvertrag, Datenkontrakt, Seiten, Ehrlichkeitsregeln, Abnahmekriterien. |
| 2 | [V5.7_ERRATUM_AND_V1_FIXES.md](V5.7_ERRATUM_AND_V1_FIXES.md) | Korrigiert §6 gegen die DFL-Spielordnung, ordnet die Engine-Korrekturen an (Protokoll 2), trennt README von Entwicklerdoku, ergänzt die Lizenzen. |
| 3 | [V5.7_ADDENDUM_CLUBELO.md](V5.7_ADDENDUM_CLUBELO.md) | Der begrenzte Rating-Übertrag als befristeter Schalter und die Datumsprüfung der Tages-CSV. |
| 4 | [FIT_EXTRACTION_BRIEF.md](FIT_EXTRACTION_BRIEF.md) | Die Fitprozedur zieht nach `packages/fit`; das Reproduktionstor ist die Abnahme, und die Summationsreihenfolge zu ändern ist ab jetzt eine Prozess-B-Änderung. |
| 5 | [PRE_V1.1_CLEANUP_BRIEF.md](PRE_V1.1_CLEANUP_BRIEF.md) | Schließt die Lücken aus der Extraktions-Durchsicht und setzt die Cron-Flag. Trägt außerdem zwei Zusätze für den V1.1-Umfang. |
| 6 | [CLUBELO_FOLLOWTHROUGH_BRIEF.md](CLUBELO_FOLLOWTHROUGH_BRIEF.md) | Nach der Erlaubnis des clubelo-Betreibers: Protokoll, Trainingsdaten committet, Reproduktionstor in CI, ein Abruf pro Tag statt zwölf, Relaunch-Playbook, App B in CI. |
| 7 | [V2A_SZENARIEN_BRIEF.md](V2A_SZENARIEN_BRIEF.md) | Nur die Szenarien-Hälfte von V2: Was-wäre-wenn, Beispielsaison, Solver „Was muss passieren?" (gebaut, getestet, bei > 5 Spieltagen unsichtbar). Die Historie (V2b) ist ausdrücklich zurückgestellt, mit Auslösebedingung. |
| 8 | [SZENARIEN_UX_BRIEF.md](SZENARIEN_UX_BRIEF.md) | Reine Präsentation plus eine Spezifikationsänderung: §10 verfeinert (analytisch vs. illustrativ). What-if-Politur (Spieltagsgruppierung, Zustände, expliziter Rechnen-Button) und die neue Methodik-Seite „So entsteht die Prognose" mit der Beispielsaison als Exponat. |
| 9 | [SZENARIEN_TABS_TEXTE_BRIEF.md](SZENARIEN_TABS_TEXTE_BRIEF.md) | Ergebnistabelle in Tabs je Ziel; wörtliche Textrevisionen; eine §8-Inhaltskorrektur in Methodik Schritt 1 (falscher Kausalsatz zu RATING_SIGMA). Reine Präsentation. |
| 10 | [SCORELINE_KONVENTION_BRIEF.md](SCORELINE_KONVENTION_BRIEF.md) | Eine reine Anzeige-Hilfsfunktion `favouriteScoreline`: das gezeigte „wahrscheinlichste Ergebnis" ist das Modalergebnis innerhalb der wahrscheinlichsten Tendenz. Sonst keine Verhaltensänderung. |
| 11 | [TEXTMASS_DUELLE_BRIEF.md](TEXTMASS_DUELLE_BRIEF.md) | Reine Präsentation: Textmaß-Token `--measure-text` als einzige Quelle für Fließtextbreite; „Direkte Duelle" mit Tabs je Ziel über die geteilte `Tabs`-Komponente. |
| 12 | [ZAHLENFORMAT_BRIEF.md](ZAHLENFORMAT_BRIEF.md) | Reine Präsentation: feste Nachkommastelle in `percent()`, ein Vorzeichen-Pfad (`pp`/`points`), `rating()` ohne Tausenderpunkt, Restprogramm-Schwere als Abweichung vom Ligamittel (vor dem 1. Spieltag verborgen). |
| 13 | [UEBERSICHT_HEADER_FOOTER_BRIEF.md](UEBERSICHT_HEADER_FOOTER_BRIEF.md) | Präsentation + zwei Amendments (Läufe-Auswahl weg, Was-wäre-wenn fix 2 000): Platzierungszonen-Umbau, entzerrtes „Wichtigstes Spiel" mit §10-Toggle, dreizeiliger Footer mit Version+Build-Stempel, Provenienz nach Methodik. |
| 14 | [FARBEN_UNTERTITEL_BRIEF.md](FARBEN_UNTERTITEL_BRIEF.md) | Addendum zu 13: entschiedener Header-Untertitel und ein Farbsystem aus Tokens (Ausgang/Vorzeichen/Zonen), Farbe nie alleiniger Bedeutungsträger. |
| 15 | [ZONEN_LAYOUT_RELEASES_BRIEF.md](ZONEN_LAYOUT_RELEASES_BRIEF.md) | Zonen-Karte `max(Zonenplätze, 3)`, Übersicht als Spaltenlayout, „Wie gerechnet?" als geteilte Komponente und stehende Regel, Version wird Tag + Release, README-Badges. |
| 16 | [PRESETS_FREIGEBEN_DUELLE_BRIEF.md](PRESETS_FREIGEBEN_DUELLE_BRIEF.md) | Ein neues Primitiv (Freigeben: gespielte Spiele im Was-wäre-wenn), eine Preset-Leiste (Bereich × Rezept, fünf Rezepte, Stapel-Semantik), eine seitenübergreifende Duell-Hervorhebung aus einer Quelle. Genau ein Engine-Helper (`regionModal`); Freigeben ist eine UI-Datenstands-Transformation, kein Engine-Eingriff. |
| 17 | [SZENARIO_TABELLE_BRIEF.md](SZENARIO_TABELLE_BRIEF.md) | Simulierte Szenario-Schlusstabelle mit Positions-Indikator (CRN gegen die gepaarte 2 000er-Basis), „Anwenden & rechnen", und eine geteilte `LeagueTable` für Spieltage, Tabelle & Prognose und die Szenario-Tabelle. Keine neue Engine-Berechnung; der Worker reicht vorhandene Aggregate durch. Vor Release 2.2.0 (Brief 16 + 17). |
| 18 | [SZENARIO_TABELLE_ABSCHLUSS_BRIEF.md](SZENARIO_TABELLE_ABSCHLUSS_BRIEF.md) | Abschluss von 17: Positions-Indikator ans rechte Tabellenende (Kopf „Δ Platz"), vereinfachter Verankerungssatz, dann Release 2.2.0 (Bump = Tag + Release, Brief 16 + 17). Keine Engine-/Pipeline-/Datenänderung. |
| 19 | [V2B1_HISTORISCHE_SAISONS_BRIEF.md](V2B1_HISTORISCHE_SAISONS_BRIEF.md) | Historische Saisons 2011/12–2025/26 als zweite globale Dimension (Saison), nur aus den committeten Fit-Trainingsdaten + G1-Relegationsdaten. Null clubelo. Mehrphasig; Phase 1 (Gates: Klub-Register, Relegationsrecord, Tiebreak-Entscheidung) gelandet. |
| 20 | [FIX_ARCHIV_SZENARIEN_PROMPT.md](FIX_ARCHIV_SZENARIEN_PROMPT.md) | Fix vor 2.3.0: der `remaining.length === 0`-Frühausstieg in `Szenarien.jsx` entfällt; eine voll gespielte Archiv-Saison rendert die normale Spieltagsliste (alle Spiele real, Freigeben/Festsetzen, Presets). Neuer Seitenebenen-Rendertest. |
| 21 | [ARCHIV_DUELLE_PROMPT.md](ARCHIV_DUELLE_PROMPT.md) | Fix vor 2.3.0: Bereichsregel (ein Preset-Bereich ohne Treffer wird nicht angeboten) + historische Duelle (`historicalDuels` über den Timeline-Punkt M−1, eine Implementierung/zwei Datenquellen). |
| 22 | [DUELLE_ERGEBNISSE_PROMPT.md](DUELLE_ERGEBNISSE_PROMPT.md) | Fix vor 2.3.0: die Duelle-Karte zeigt je Ziel-Tab „Anstehend" und „Gespielt" (mit Endergebnis, Heim zuerst); leere Abschnitte verbergen sich, Tab-Zähler = Summe. Reiner Daten-Join. |
| 23 | [CHART_AUSBAU_BRIEF.md](CHART_AUSBAU_BRIEF.md) | Diagramm-Ausbau (Referenz WM-App): geteilte `ChartTooltip`/`ChartLegend`/`ChartInteractive`, Zonenverteilung statt Titelchance-Linie, Kalibrierung/Güte-Zeitreihen mit Achsen/Legenden/Tooltips. Zwei erlaubte reine Engine-Aggregationen (`zonePartition`, `cumulativeSeries`). Danach Release 2.3.0. |
| 24 | [CODEX_REVIEW_FIXES_BRIEF.md](CODEX_REVIEW_FIXES_BRIEF.md) | Codex-Review-Fixes: jsdom-Interaktions-Testschicht, datensatzgebundener Remount-Key, ARIA-Tabs-Tastatur, `getOptionalJson`-Fail-loud, README-Kausalfix + repo-weiter Scan, Doku-Zustand nur in CLAUDE.md. Danach Release 2.3.2. |
| 25 | [KICKTIPP_PARSER_FIX_BRIEF.md](KICKTIPP_PARSER_FIX_BRIEF.md) | App B: struktureller Parser gegen das echte Kicktipp-Markup (Wettquoten nur aus dem Quotenblock, Punkteregel getrennt, Nur-Modell-Modus, „Das habe ich verstanden"-Panel, text/html-Paste). Committete Fixture als Referenz; Register um Kicktipp-Namensformen (BL1 verifiziert, BL2 als Folge). Kein Release-Bump (App B wird nie deployt). |
| 26 | [KICKTIPP_TRANSPARENZ_BRIEF.md](KICKTIPP_TRANSPARENZ_BRIEF.md) | App B: Rechenweg je Spiel (Markt-%/Modell-%/Marge, Erwartungswert-Zerlegung = expectedPoints bitgleich) + Grundlage-Umschalter Markt/Modell (Modell-Basis = bestehender Fallback). Reines Surfacing. §2/§3 gelandet; §1 als eigener Brief 27. Kein Release-Bump. |
| 27 | [KICKTIPP_MD1_QUOTENFIX_BRIEF.md](KICKTIPP_MD1_QUOTENFIX_BRIEF.md) | Ergänzung zu 26: App B parst beide Kicktipp-Quotenvarianten mit einer Extraktion (md1 = Oddset-Anker `quoteheim` ohne Bindestrich, Gast in col1s Stack `data-from=2`). Fix: Quoten primär über `quote-label` (1/X/2), Gast spiegelbildlich zu Heim. md1-Fixture committet. Kein Release-Bump. |

**Stehende Regel:** Ein neuer Brief bekommt seinen Ketteneintrag in
[../../CLAUDE.md](../../CLAUDE.md) **und** seine Zeile in diesem Index im selben
Commit — sonst endet der Index dort, wo die letzte Doku-Runde aufhörte (genau das
war ein Codex-Befund: der Index stand bei Brief 19, vier Spezifikationen fehlten).

## Diese Dateien werden nicht bearbeitet

Sie sind das Protokoll dessen, was wann entschieden wurde — auch dort, wo sich
später herausstellte, dass etwas falsch war. Zwei Beispiele, die im Bau eine
Rolle gespielt haben:

- v5.6 §6 gab die Tiebreak-Reihenfolge falsch wieder. Der Text steht unverändert
  da; was gilt, steht in [../verification/dfl-spielordnung.md](../verification/dfl-spielordnung.md).
- v5.7 §10 erlaubte noch `LAB_REPO_TOKEN`. Seit der Fit-Extraktion ist nur noch
  `GITHUB_TOKEN` erlaubt.
- Der Fit-Extraktions-Brief ging davon aus, dass die Trainings-Elo-Werte
  uncommittet bleiben. Seit der Erlaubnis des clubelo-Betreibers vom 2026-07-23
  sind sie committet (Brief 6).

**Was operativ gilt, steht in [../DEVELOPMENT.md](../DEVELOPMENT.md)**, nicht
hier. Wer wissen will, wie das Projekt heute funktioniert, liest dort — wer
wissen will, warum es so ist, liest hier.
