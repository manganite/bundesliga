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
