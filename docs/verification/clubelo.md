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

## Befund 1d — Datierungskonvention: die Zeile des Spieltags ist das Pre-Match-Rating

Verifiziert an echten Daten der Saison 2025/26. clubelo führt die Zeile, die den
**Spieltag selbst** abdeckt, als Wert **vor** dem Spiel; die Änderung erscheint
am Folgetag:

| Klub | Sieg am | Zeile über den Spieltag | ab dem Folgetag |
|---|---|---|---|
| Leverkusen | 27.09.2025 | 1838,5 (26.–27.09.) | 1841,9 (ab 28.09.) |
| Bayern | 29.11.2025 | 1988,5 (28.–29.11.) | 1989,6 (ab 30.11.) |
| Frankfurt | 14.03.2026 | 1681,8 (13.–14.03.) | 1684,8 (ab 15.03.) |

Das hat zwei Konsequenzen, die im Code bewusst **auseinanderfallen**:

- Die **Prognoseregel** (`preMatch.mjs`) nimmt weiterhin den letzten Snapshot
  *strikt vor* dem Anstoßdatum. Konservativ mit Absicht: so kann das Ergebnis
  eines Spiels niemals in die eigene Prognose lecken, selbst wenn clubelo die
  Datierung änderte. Bei täglichen Snapshots kostet das höchstens einen Tag
  Aktualität.
- Das **Richtungs-Gate** (`verify.mjs`) nimmt die Zeile *des Spieltags*, weil es
  die entgegengesetzte Aufgabe hat: ein einzelnes Spiel möglichst eng isolieren.

## Befund 1e — clubelo bewertet alle Wettbewerbe, unsere Spielpläne nur die Liga

Das Richtungs-Gate („nach einem Sieg muss das Rating steigen") war zunächst mit
einem wochenbreiten Fenster gebaut und meldete **22 Verstöße in 216 Prüfungen**.
Keiner davon war echt: clubelo rechnet Champions League und Pokal mit, die
Ligadaten kennen diese Spiele nicht. Bayern etwa gewann am 29.11. — das Rating
stieg korrekt —, verlor aber am 01.12. in Europa, und der Wochenvergleich zeigte
deshalb einen Rückgang.

Ein breiteres Fenster macht die Prüfung nicht stärker, sondern falsch. Mit einem
±2-Tage-Fenster und der Datierungskonvention aus 1d bleibt von den 22 Meldungen
**keine** übrig:

```
verified: counts, club ratings, rating direction
  (checked 457, skipped 5, 1 with no published rating update)
```

457 entschiedene Spiele beider Ligen, **null Verstöße**. Das validiert
Klub-Mapping, Datumsausrichtung und Snapshot-Archiv unabhängig voneinander.

Der eine Fall „ohne veröffentlichte Aktualisierung" ist Elversberg am letzten
BL2-Spieltag: 3:0 gewonnen, Rating auf die Nachkommastelle unverändert. clubelo
schreibt nach Saisonende fort, statt neu zu rechnen. Exakte Gleichheit wird
deshalb als fehlende Aktualisierung gezählt, nicht als Verstoß — ein falscher
Join zeigt sich als *Rückgang*, nicht als bitgleicher Wert.

## Konsequenz für den Bau

§5.2 ist eindeutig: *„Ein unresolved club **fails the job and blocks the
commit**."* Die Pipeline ist genau so gebaut und würde heute **den Commit
verweigern**. Das ist korrektes Verhalten — ein falsches Rating wäre schlimmer
als gar keines, weil es still ist.

Praktisch bedeutet das: **V1 kann nicht live gehen, solange diese Lücke
besteht.** Drei Punkte dazu:

1. Die Saison beginnt am 2026-08-28. Bis dahin ist Zeit.
2. **Die Lücke ist nicht strukturell — belegt, nicht vermutet.** Gegenprobe
   mitten in der abgelaufenen Saison:

   ```
   $ node pipeline/src/checkClubeloCoverage.mjs 2026-05-01 2025
   clubelo snapshot 2026-05-01: 628 clubs
   === bl1 2025 — 18 clubs — resolved 18/18 ===  ✓ every club resolves
   === bl2 2025 — 18 clubs — resolved 18/18 ===  ✓ every club resolves
   all clubs resolve — gate passed
   ```

   Während der Saison löst also **jeder** der 36 Klubs auf. Das Mapping ist
   damit unabhängig verifiziert, und die vier Lücken vom 2026-07-23 sind ein
   Zustand der Sommerpause, kein dauerhafter Wegfall. Die übrigen Klubs haben
   überdies bereits Ratings mit `To`-Datum bis 2026-08-29 bzw. 2026-12-31 —
   clubelo schreibt vorwärts.
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

---

## Stand 2026-07-23 — der Zustand, der V1 blockiert hat

Angehängt, nicht eingearbeitet: die Befunde oben bleiben so stehen, wie sie
erhoben wurden.

**Was der gescheiterte Pipeline-Lauf gezeigt hat.** Die Saisonerkennung ist von
selbst umgesprungen — 2026/27, 306 Spiele, 18 Klubs je Liga. Die Lücke blockierte
damit nicht mehr nur ein rückblickendes Archiv, sondern eine *laufende* Prognose.

Die Tages-CSV war intakt: sie bestand die ≥100-Zeilen-Prüfung, das Mapping löste
auf, und **32 von 36 Klubs bekamen ein Rating**. Gegengeprüft über die Zahl der
`Country = GER`-Zeilen (36 − 32 = 4). Es fehlte nichts unbemerkt.

**Das Muster ist kein Ausfall, sondern ein hängengebliebener Zustand.** Die vier
Klubs tragen `To = 2026-07-03` — ein Datum in der **Vergangenheit** —, während
alle übrigen Klubs `To = 2026-08-29` oder `2026-12-31` tragen, also in der
Zukunft. clubelo hat nicht aufgehört zu veröffentlichen; diese vier Reihen wurden
am 3. Juli geschlossen und nie wieder geöffnet.

Unabhängige Gegenprobe am selben Tag: `clubelo.com/Bayern` lädt, liefert aber
eine zwischengespeicherte Seite vom **6. Mai 2026**, passend zum Hinweis der
Seite „Site overloaded, only cached pages available". Alle vier Klubs sind dort
normalerweise bewertet. **Kein Mapping-Fehler auf unserer Seite.**

| Klub | letzter Wert | gültig bis |
|---|---|---|
| FC Bayern München | 2000,87 | 2026-07-03 |
| VfB Stuttgart | 1763,83 | 2026-07-03 |
| VfL Wolfsburg | 1599,57 | 2026-07-03 |
| 1. FC Kaiserslautern | 1456,04 | 2026-07-03 |

**Konsequenz im Code** (v5.7 Addendum): ein begrenzter Rating-Übertrag als
ausdrücklicher, zeitlich befristeter Schalter — `--carry-forward-until`. Er ist
**standardmäßig aus**; ohne ihn scheitert der Lauf weiterhin. Ein clubelo-Rating
ist eine Treppenfunktion und ändert sich nur, wenn ein Klub spielt; in einer
echten Sommerpause *ist* der Wert vom 3. Juli der Wert vom 23. Juli. Weil die
Pipeline aber nur Ligaspiele sieht und nicht Pokal oder europäische
Qualifikation, verfällt die Regel nach spätestens 42 Tagen — auch dann, wenn der
Schalter länger gesetzt ist.

**Ein Punkt, den das Addendum nicht vorhersah.** Der Übertrag braucht einen
archivierten Snapshot aus der Zeit, als clubelo die Klubs noch führte. Unser
Archiv reichte nur bis 2026-06-01 (52 Tage, jenseits der Decke), und *Warten
hätte das nie geheilt*: jede künftige Tages-CSV enthält die vier Klubs nicht
mehr, der Abstand wächst also nur. Deshalb wurde die Tages-CSV vom **2026-07-03**
einmalig nachträglich archiviert (`pipeline/src/archiveDay.mjs`, eine Anfrage,
dieselbe Art wie der reguläre Cron). Der Snapshot trägt sein echtes
`effectiveAt` 2026-07-03 und ein `observedAt` von heute — nichts ist rückdatiert,
nichts Bestehendes verändert.

Danach lief die Pipeline durch: Saison 2026/27 live, vier Klubs mit einem 20 Tage
alten Rating, in der App je Klub markiert und in der Kopfzeile benannt.

**Die Lizenzfrage ist weiter offen.** Die Anfrage an den Betreiber ist raus
(2026-07-23) und unbeantwortet. Bis zur Antwort werden über den regulären Abruf
hinaus keine Daten geholt. Wo das Archiv liegt, ist Konfiguration
(`BUNDESLIGA_RATINGS_DIR`); ein Umzug in ein privates Repo wäre eine
Konfigurationsänderung plus Migration, kein Refactoring.

---

## Stand 2026-07-23, 16:34 MESZ — die Erlaubnis liegt vor ✅

Angehängt, nicht eingearbeitet (Addendum A §2.8): die Abschnitte oben bleiben so
stehen, wie sie erhoben wurden. Der letzte Satz des vorigen Abschnitts
(„Die Lizenzfrage ist weiter offen") ist damit **überholt** — hier steht, was
stattdessen gilt.

### Was gefragt wurde

Anfrage am 2026-07-23, 11:43 MESZ, an den Betreiber von clubelo.com. Zwei
Fragen, wörtlich:

> 1. Planned API usage: one daily-CSV fetch every ~2 hours in season, plus a
>    one-time cached backfill of current-season histories — sequential requests,
>    descriptive user agent, no test loops against the live API. Is that okay?
>
> 2. The pipeline would commit small derived rating snapshots (36 German clubs,
>    point-in-time values) to the public repo for reproducibility. Are you fine
>    with that, or should the archive stay private?

Die Fragen stehen hier mit, weil die Antwort ohne sie nicht lesbar ist: „both"
bezieht sich genau auf diese beiden.

### Was geantwortet wurde

Antwort am **2026-07-23, 16:34 MESZ**, wörtlich und vollständig:

> in principle this is fine, both, no problem at all, just be aware that i
> relaunch the website before the new season and have projections myself.

Die Mailadresse des Betreibers steht hier bewusst **nicht**; dieses Repository
ist öffentlich, und für das Protokoll genügt, dass die Erlaubnis vom Betreiber
kam und wann.

### Was das abdeckt

- **(a) Das geplante Abrufmuster.** Tages-CSV im Zwei-Stunden-Rhythmus während
  der Saison, einmaliger Backfill der Saisonhistorien, sequentiell, mit
  sprechendem User-Agent, keine Testschleifen gegen die Live-API.
- **(b) Die öffentliche Weitergabe abgeleiteter Rating-Snapshots**, damit auch
  der Trainings-Elo-Datensatz unter `data/ratings/training-elo/`. Das Archiv
  bleibt öffentlich; ein privates Repo ist nicht mehr nötig.

**Eine Genauigkeit zum Umfang, damit ein späterer Leser sie nicht selbst
herausfinden muss.** Frage 2 nannte in der Klammer „36 German clubs,
point-in-time values". Der Trainings-Elo-Datensatz ist dieselbe *Art* Daten —
abgeleitete Pre-Match-Werte deutscher Klubs, committet zur Reproduzierbarkeit —
aber über 15 Saisons und damit über mehr als 36 Klubs und rund 964 KB. Die
Antwort „both, no problem at all" zu einer ausdrücklich nicht-kommerziellen,
quelloffenen Nutzung deckt das nach unserer Lesart ab; wer das enger sehen will,
findet hier beide Texte im Wortlaut und kann selbst urteilen.

### Die Höflichkeitsregel bleibt in Kraft — wörtlich

> **access as sparingly as possible; permission is not a licence to be greedy.**

Eine Erlaubnis ist kein Freibrief. Umgesetzt ist sie ab jetzt nicht nur als
Vorsatz, sondern als Code: der Tagesabruf **entfällt**, sobald der heutige Stand
im Archiv liegt (`pipeline/src/update.mjs`). clubelo veröffentlicht höchstens
einen Snapshot je Tag; der Cron lief zwölfmal täglich und holte jedes Mal.
Im eingeschwungenen Zustand bleibt **eine Anfrage pro Tag** statt zwölf. Der
OpenLigaDB-Abruf behält seinen Zwei-Stunden-Rhythmus — Ergebnisse ändern sich
untertägig, Ratings nicht.

### Betriebliche Tatsache: der Relaunch

Der Betreiber kündigt an, **die Website vor der neuen Saison neu zu starten**,
und weist darauf hin, dass er selbst Projektionen anbietet. Beides ist zur
Kenntnis genommen: das erste als Betriebsrisiko (siehe das Playbook unten), das
zweite als Hinweis, dass diese App eine unabhängige, klar attribuierte
Zweitverwertung ist und keine Konkurrenz behauptet.

## Playbook — wenn der Cron nach dem Relaunch rot wird

Der Relaunch fällt voraussichtlich **genau in die Wochen vor dem BL2-Start am
2026-08-07**. Endpunkte, Namensformen oder CSV-Form können sich dabei ändern.

**Vorsorglich wird nichts umgebaut.** Die bestehenden Wächter sind die richtigen
Detektoren und sollen anschlagen: ≥100-Zeilen-Prüfung, Datumsabdeckung ≥ 90 %,
fail-closed-Mapping. Was fehlte, war nicht Code, sondern eine Diagnosereihenfolge:

> Wenn der Cron nach dem Relaunch rot wird: zuerst Formatdrift annehmen, nicht
> Datenfehler. Prüfreihenfolge: (1) HTTP-Status und Zeilenzahl der Tages-CSV,
> (2) Header-Spalten, (3) Namensformen gegen das Mapping (beide Formen!),
> (4) Datumsabdeckung. Erst wenn alle vier stimmen, ist es ein Datenproblem.
> Nach dem Relaunch einmalig die Namensform-Verifikation aus
> docs/verification/clubelo.md für alle 36 Klubs wiederholen — als Gate-Lauf,
> nicht als Bulk (die Tages-CSV enthält alle Namen in einem Abruf).

Der Gate-Lauf dafür ist `npm run gate:clubelo` — ein Abruf, alle Namen.

**Eine Hoffnung, kein Plan:** der Relaunch könnte die vier eingefrorenen
Rating-Reihen wieder in Gang bringen. Falls ja, räumen sich die
Carry-Forward-Markierungen von selbst ab und die Flag `--carry-forward-until`
vom 2026-08-14 läuft ungenutzt aus. Planungsgrundlage ist das nicht: die
Eskalationsfrist Anfang August bleibt stehen.
