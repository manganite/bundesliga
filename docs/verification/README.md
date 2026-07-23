# Verifikationen vor dem Bau (Brief §11)

Dieses Verzeichnis hält die „before building"-Gates aus §11 fest — mit Quelle,
Abrufdatum und Befund. Ein Gate gilt erst als geschlossen, wenn es hier steht.

Abrufdatum aller Prüfungen unten: **2026-07-23**.

| # | Gate (§11) | Status | Datei |
|---|---|---|---|
| 1 | OpenLigaDB: Nutzungsbedingungen, kein API-Key | ✅ geschlossen | [openligadb.md](openligadb.md) |
| 2 | OpenLigaDB: Current-Season-Endpunkt (sonst Datumsregel) | ✅ geschlossen | [openligadb.md](openligadb.md) |
| 3 | clubelo: Abdeckung je Saison und Klub, inkl. 2. Bundesliga | ⚠️ **offen — Lücke** | [clubelo.md](clubelo.md) |
| 4 | DFL-Spielordnung: Tiebreak-Reihenfolge gegen die Primärquelle | ✅ geschlossen — **Brief §6 war falsch** | [dfl-spielordnung.md](dfl-spielordnung.md) |
| 5 | DFL-Spielordnung: änderte sich die Reihenfolge im Fenster ab 1995/96? | ⏸️ offen, V2-Gate | [dfl-spielordnung.md](dfl-spielordnung.md) |
| 6 | 3-Punkte-Regel: exakte Cutoff-Saison | ✅ geschlossen — 1995/96 | [drei-punkte-regel.md](drei-punkte-regel.md) |
| 7 | Track C: trägt `season-params.json` per-league Felder? | ✅ geschlossen — **ja** | [track-c-parameter.md](track-c-parameter.md) |

Bereits im Brief als verifiziert markiert und hier **nicht** wieder geöffnet:
Kicktipp-Punkteschema (§9), Auswärtstor-Grenze 2020/21 → 2021/22 (§5.4/§6),
Heimrecht-Regel im Relegations-Rückspiel (§6). Gate 4 hat die letzten beiden
allerdings unabhängig bestätigt — siehe [dfl-spielordnung.md](dfl-spielordnung.md).

## Zusammenfassung der zwei Befunde, die den Bau verändert haben

**§6 gab die Tiebreak-Reihenfolge falsch wieder.** Der Brief nannte als dritte
Stufe einen „Direkten Vergleich (Punkte, Tordifferenz, Auswärtstore)". Eine Stufe
„Punkte im direkten Vergleich" existiert in der Spielordnung nicht. Zusätzlich
fehlten im Brief die In-Saison-Regeln vollständig (nur die ersten beiden Kriterien
vor absolviertem Hin- **und** Rückspiel; geteilte Tabellenplätze; kein
Entscheidungsspiel während der laufenden Spielzeit). Der Ranker folgt der
Spielordnung — so entschieden am 2026-07-23.

**clubelo hat aktuell eine Abdeckungslücke.** Vier der 36 Klubs beider Ligen
haben zum Prüfzeitpunkt kein Rating, das den heutigen Tag abdeckt. Unter der
fail-closed-Regel aus §5.2 verweigert die Pipeline damit den Commit. Das ist
korrektes Verhalten, kein Defekt — aber es heißt, dass V1 erst live gehen kann,
wenn clubelo diese Klubs wieder führt.
