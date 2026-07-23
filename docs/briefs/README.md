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

## Diese Dateien werden nicht bearbeitet

Sie sind das Protokoll dessen, was wann entschieden wurde — auch dort, wo sich
später herausstellte, dass etwas falsch war. Zwei Beispiele, die im Bau eine
Rolle gespielt haben:

- v5.6 §6 gab die Tiebreak-Reihenfolge falsch wieder. Der Text steht unverändert
  da; was gilt, steht in [../verification/dfl-spielordnung.md](../verification/dfl-spielordnung.md).
- v5.7 §10 erlaubte noch `LAB_REPO_TOKEN`. Seit der Fit-Extraktion ist nur noch
  `GITHUB_TOKEN` erlaubt.

**Was operativ gilt, steht in [../DEVELOPMENT.md](../DEVELOPMENT.md)**, nicht
hier. Wer wissen will, wie das Projekt heute funktioniert, liest dort — wer
wissen will, warum es so ist, liest hier.
