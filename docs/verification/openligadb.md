# Gate 1 + 2 — OpenLigaDB

Geprüft am 2026-07-23 gegen die Live-API.

## Gate 1 — Zugang ohne API-Key, Nutzungsbedingungen ✅

**Kein Schlüssel nötig.** <https://www.openligadb.de/> sagt wörtlich:

> Das Abrufen der Daten über den Webservice erfordert keinerlei Authentifizierung

Alle unten protokollierten Abrufe liefen ohne Header außer einem `user-agent`.

**Lizenz: Open Database License (ODbL) 1.0.**

> Die über diese API bereitgestellten Daten stehen unter der
> Open Database License (ODbL)

<https://opendatacommons.org/licenses/odbl/1-0/>, verlinkt von
<https://www.openligadb.de/lizenz>.

**Konsequenz, die der Brief nicht behandelt:** Die ODbL ist keine
Public-Domain-Freigabe. Sie verlangt **Namensnennung** und wirkt als
**Share-alike** auf abgeleitete Datenbanken. Dieses Repo committet Ergebnis- und
Fixture-Dateien, die aus OpenLigaDB abgeleitet sind — das ist eine abgeleitete
Datenbank im Sinne der Lizenz. Daraus folgt für den Bau:

- Die App nennt OpenLigaDB sichtbar als Quelle (Fußzeile und README).
- Jede committete Datendatei trägt ihre Quelle im `source`-Feld.
- Die committeten Daten stehen ihrerseits unter ODbL; das README sagt das.

Das ist eine Feststellung, keine offene Frage — die Auflagen sind erfüllbar und
im Bau berücksichtigt.

## Gate 2 — Current-Season-Endpunkt ✅ vorhanden, keine Datumsregel nötig

`GET https://api.openligadb.de/getmatchdata/<liga>` **ohne Saisonangabe** liefert
den aktuellen Spieltag der aktuellen Saison, und jedes Match trägt die Saison
selbst:

```
$ curl https://api.openligadb.de/getmatchdata/bl1
→ 9 Spiele, erstes Objekt:
  leagueName    "1. Fußball-Bundesliga 2026/2027"
  leagueSeason  2026
  leagueShortcut "bl1"
  group         { groupName: "1. Spieltag", groupOrderID: 1, groupID: 50633 }
  matchDateTime "2026-08-28T20:30:00"
```

Damit ist die in §5.5 geforderte **automatische Saisonerkennung** direkt aus der
Quelle möglich; die dort erlaubte „dokumentierte Datumsregel" als Rückfallebene
wird nicht gebraucht. Ergänzend bestätigt:

| Abruf | Ergebnis |
|---|---|
| `getcurrentgroup/bl1` | `{ groupName: "1. Spieltag", groupOrderID: 1, groupID: 50633 }` |
| `getmatchdata/bl1/2026` | 306 Spiele, 34 Spieltage, 2026-08-28 → 2027-05-22, 0 beendet |
| `getmatchdata/bl2/2026` | 306 Spiele, erstes am 2026-08-07 |
| `getavailablegroups/bl1/2026` | 34 Spieltage |

**Saisonzustand am Prüftag:** Die Saison 2026/27 ist angesetzt, aber noch kein
Spiel gespielt. V1 startet also in den in §5.5 verlangten Vorsaison-/Off-Season-
Zustand — nicht in eine laufende Saison. Das ist für die Abnahme relevant:
„Saison beendet" bzw. Vorsaison-Prognose ist der Zustand, der zuerst sichtbar
wird.

**Robustheitshinweis für die Pipeline:** `getmatchdata/<liga>` ohne Saison
liefert nur den *aktuellen Spieltag*, nicht die ganze Saison. Die Pipeline liest
daraus Saison und Spieltag und holt den Rest über `getmatchdata/<liga>/<saison>`.
Die Saison wird nirgends hartkodiert (§5.5).
