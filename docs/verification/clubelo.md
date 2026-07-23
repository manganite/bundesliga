# Gate 3 — clubelo: Abdeckung je Saison und Klub ⚠️ Lücke

Geprüft am 2026-07-23 gegen <http://api.clubelo.com/>. Prüfskript:
`pipeline/src/checkClubeloCoverage.mjs` (reproduzierbar).

## Zugang ✅

Kein API-Key. Zwei Endpunkte, beide CSV:

| Endpunkt | Inhalt |
|---|---|
| `api.clubelo.com/<YYYY-MM-DD>` | Rating **aller** Klubs an diesem Tag |
| `api.clubelo.com/<Klubname>` | vollständige Historie eines Klubs |

Der Tagesendpunkt ist genau das, was die Pipeline braucht: eine
point-in-time-Momentaufnahme, aus der `effectiveAt` direkt folgt. Die
Klub-Historie deckt den Backfill aus §5.3 ab — Stichprobe `Werder` reicht bis
**1951-07-01** zurück, also weit über das V2-Fenster ab 1995/96 hinaus.

## Befund 1 — zwei Namensformen, die nicht identisch sind ⚠️

clubelo führt denselben Klub unter **zwei verschiedenen Schreibweisen**, je
nachdem, welchen Endpunkt man benutzt:

| Klub | URL-Form (Historien-Endpunkt) | `Club`-Feld im Tages-CSV |
|---|---|---|
| 1. FC Union Berlin | `UnionBerlin` | `Union Berlin` |
| RB Leipzig | `RBLeipzig` | `RB Leipzig` |
| FC St. Pauli | `StPauli` | `St Pauli` |

Die URL-Form entfernt Leerzeichen, das CSV-Feld behält sie. Ein Join, der beide
Formen verwechselt, findet den Klub schlicht nicht — und produziert damit genau
den stillen Fehlschlag, den §5.2 verbietet. Das Mapping in der Pipeline führt
deshalb **beide Formen explizit** und ist nicht abgeleitet.

Das ist kein Abdeckungsproblem: alle drei Klubs sind vollständig vorhanden.

## Befund 1b — ein falscher Name liefert HTTP 200, nicht 404 ⚠️

Ein Abruf mit einem Namen, den clubelo nicht kennt, antwortet mit **HTTP 200 und
einer reinen Kopfzeile ohne Datenzeilen**:

```
$ curl http://api.clubelo.com/MSVDuisburg
Rank,Club,Country,Level,Elo,From,To      ← nur der Header, HTTP 200
$ curl http://api.clubelo.com/Duisburg
… 4407 Zeilen, letzte: None,Duisburg,GER,2,1377.09,2019-05-20,2019-07-01
```

Ein Tippfehler im Mapping würde also **nicht** durch einen Fehlerstatus
auffallen, sondern still als „keine Ratings" durchgehen — exakt die Fehlerart,
die §5.2 als die gefährliche benennt. Konsequenz: `hasRealHistory()` in
`pipeline/src/clubMapping.mjs` behandelt eine Antwort mit weniger als 50
Datenzeilen als Fehlschlag. Alle 50 gemappten Namen wurden am 2026-07-23 einzeln
gegen diese Prüfung verifiziert; alle liefern eine tiefe Historie.

## Befund 1c — OpenLigaDB führt einen Klub unter zwei teamIds

Würzburger Kickers erscheint mit `teamId` **398** und **4437**. Beide sind
derselbe Klub und teilen zu Recht eine clubelo-Historie. Die Eins-zu-eins-Prüfung
aus §5.2 liegt deshalb auf der **Klubidentität**, nicht auf der `teamId` — sonst
schlüge sie bei einer Quelldublette fälschlich Alarm, statt bei dem Fall, der
wirklich gefährlich ist: zwei *verschiedene* Klubs auf einer Historie.

## Befund 2 — vier Klubs ohne aktuelles Rating ❌

Von den 36 Klubs der Saison 2026/27 beider Ligen sind am 2026-07-23 nur **32** im
Tages-Snapshot. Die fehlenden vier haben Historien, die exakt am **2026-07-03**
enden, während alle anderen Klubs bis 2026-08-29 oder 2026-12-31 reichen:

| Klub | clubelo-Name | Liga 2026/27 | Historie endet | letztes Elo |
|---|---|---|---|---|
| FC Bayern München | `Bayern` | bl1 | 2026-07-03 | 2000,9 |
| VfB Stuttgart | `Stuttgart` | bl1 | 2026-07-03 | 1763,8 |
| VfL Wolfsburg | `Wolfsburg` | bl2 | 2026-07-03 | 1599,6 |
| 1. FC Kaiserslautern | `Lautern` | bl2 | 2026-07-03 | 1456,0 |

Gegenprobe: der Snapshot enthält 32 Klubs mit `Country = GER`, 36 − 32 = 4 — es
gibt also keine umbenannten Doppel, die der Join übersehen hätte. Die Lücke ist
echt.

## Konsequenz für den Bau

§5.2 ist eindeutig: *„Ein unresolved club **fails the job and blocks the
commit**."* Die Pipeline ist genau so gebaut und würde heute **den Commit
verweigern**. Das ist korrektes Verhalten — ein falsches Rating wäre schlimmer
als gar keines, weil es still ist.

Praktisch bedeutet das: **V1 kann nicht live gehen, solange diese Lücke
besteht.** Drei Punkte dazu:

1. Die Saison beginnt am 2026-08-28. Bis dahin ist Zeit.
2. Die übrigen Klubs haben bereits Ratings mit `To`-Datum bis 2026-08-29 bzw.
   2026-12-31 — clubelo schreibt also vorwärts. Dass genau vier Klubs am selben
   Tag enden, sieht nach einem noch nicht nachgezogenen Update aus, nicht nach
   dauerhaftem Wegfall. Belegen lässt sich das nicht; es ist eine Vermutung und
   wird hier als solche benannt.
3. Sollte die Lücke bestehen bleiben, ist das eine **Entscheidung, die dem
   Betreiber gehört**, nicht der Pipeline: entweder weiter fail-closed warten,
   oder eine explizite, im Datensatz als solche markierte Fortschreibung des
   letzten bekannten Ratings einführen. Die Engine kennt dafür bereits das Feld
   `provenance`; ein dritter Wert `carriedForward` wäre die ehrliche Form. Er ist
   **nicht** implementiert, weil der Brief ihn nicht vorsieht.

## Reproduktion

```
node pipeline/src/checkClubeloCoverage.mjs            # heute
node pipeline/src/checkClubeloCoverage.mjs 2026-08-28 # zum 1. Spieltag
```
