# Ausfallverhalten der Pipeline bei clubelo-Störungen

**Stand: 2026-08-11.** Anlass war die Frage, ob der clubelo- und der
OpenLigaDB-Abruf entkoppelt gehören — also ob Ergebnisse committet werden
sollten, auch wenn die Ratings fehlen. Die Frage hing an einer Vorannahme
(„clubelo weg = Seite tot"), die nachzurechnen war. Das Ergebnis der
Nachrechnung steht in §3 und fällt anders aus als beide vorher diskutierten
Antworten.

Dieses Dokument hält fest, was gemessen wurde, damit die Entscheidung nicht
allein im Gedächtnis der Beteiligten liegt.

---

## 1 · Welches Fehlerbild bricht ab, welches degradiert

Aus dem Code gelesen, nicht vermutet. Zeilenangaben auf dem Stand dieses
Dokuments.

| clubelo-Fehlerbild | Verhalten | Ort |
|---|---|---|
| Tagesstand liegt schon im Archiv | **clubelo wird gar nicht gefragt** — der Lauf ist gegen jede Störung immun | `update.mjs` §3, Abrufökonomie |
| Transport-/HTTP-Fehler (502, DNS, Timeout) | **harter Abbruch**, nichts geschrieben | `fetchDailySnapshot` wirft |
| CSV < 100 Zeilen | **harter Abbruch** | Zeilenzahl-Wächter |
| Datumsabdeckung < 90 % | **harter Abbruch** | Datumsprüfung der Tages-CSV |
| CSV in Ordnung, Klub fehlt, **kein** `--carry-forward-until` | **harter Abbruch** (§5.2) | `resolveMissingClubs` → `stillMissing` wirft |
| CSV in Ordnung, Klub fehlt, Flag gesetzt | degradiert: Rating wird getragen und **markiert** | `carryForward.mjs` |
| Pre-Match-Snapshot lückenhaft, kein Carry möglich | degradiert: Fixture wird `gap`, **kein Eintrag** | `preMatch.mjs:201-209` |
| Klub-Historie im Backfill nicht abrufbar | degradiert: Snapshot wird mit **weniger Klubs** angelegt | `backfillSnapshots` |

**Die entscheidende Zeile ist die zweite.** Für „clubelo ist nicht erreichbar"
existiert **kein Degradationspfad**. Der Lauf bricht ab, immer. Das ist §5.1
und richtig — aber es heißt auch: die Widerstandsfähigkeit gegen einen
clubelo-Ausfall kommt **allein** aus Zeile 1, der Abrufökonomie.

**Daraus folgt das Expositionsfenster.** Sobald irgendein Lauf eines UTC-Tages
den Tagesstand archiviert hat, überspringen alle weiteren Läufe desselben Tages
den Abruf. Jeder Tag hat damit **genau ein Fenster**, an seinem Anfang. Das ist
Konstruktion, nicht Zufall — und es ist der ganze Schutz, den es gibt.

Ein Ausfall, der ein solches Fenster überdauert, kostet den Tag vollständig:
kein Lauf schreibt etwas, auch keine Ergebnisse.

## 2 · Was am Wochenende 2026-08-07 bis 08-11 tatsächlich geschah

Der 1. BL2-Spieltag lief vom 07. bis 09. August. Die Läufe:

| Zeitraum (UTC) | Läufe |
|---|---|
| 08-08 00:32 – 06:28 | **4 Fehlschläge**, alle `HTTP 502` auf die Tages-CSV |
| 08-08 08:27 – 08-10 22:27 | **32 Läufe, alle grün** |
| 08-11 00:33 | 1 Fehlschlag (`fetch failed`) |
| 08-11 02:58 ff. | grün |

**Korrektur einer naheliegenden Lesart:** Es gab *kein* Nebeneinander von
abbrechenden und degradierenden Läufen während des Spieltags. Die 502-Serie
endete am 08-08 um 06:28 — vor dem ersten Samstagsspiel (11:00 UTC). Ab 08:27
war jeder Lauf grün. Die Ergebnisse kamen also durch, weil **clubelo rechtzeitig
zurückkam**, nicht weil die Pipeline den Ausfall überbrückt hätte. Sie hätte es
nicht gekonnt (§1, Zeile 2).

Das Expositionsfenster des 08-08 schloss sich um 08:27. Wäre die Störung bis
Sonntagabend gelaufen, wäre der komplette Spieltag ungeschrieben geblieben —
Ergebnisse eingeschlossen.

## 3 · Der Fund: dünne Backfill-Snapshots verdrängen vollständige

Die vier `carried-forward`-Einträge in `bl2/prematch.json` sahen zunächst wie
die Carry-forward-Funktion bei der Arbeit aus. Sie sind etwas anderes.

Nachgemessen:

| Fixture | benutzter Snapshot | Klubs darin | vollständige Alternative desselben Tages |
|---|---|---|---|
| Magdeburg–Braunschweig | `…e6d0de0bd482c5a3` (08-07) | **30** | `…a1c94ab421f25116`, 34 Klubs |
| St. Pauli–Fürth | `…2ba68be51ddc3bdc` (08-08) | **5** | `…a1c94ab421f25116`, 34 Klubs |
| Nürnberg–Dresden | `…2ba68be51ddc3bdc` (08-08) | **5** | dieselbe, 34 Klubs |
| Cottbus–Hannover | `…2ba68be51ddc3bdc` (08-08) | **5** | dieselbe, 34 Klubs |

Drei Sonntagsspiele rechneten auf einem **Fünf-Klub-Snapshot**, während ein
34-Klub-Snapshot desselben Tages unmittelbar daneben im Archiv lag.

**Die Ursache ist eine Kollision im selben Lauf.** `runUpdate` legt den
Backfill-Snapshot (Zeile 396) **vor** dem Tagessnapshot (Zeile 407) an, beide
mit demselben `observedAt`. Die Verdrängungsregel in `findPreMatchSnapshot`
lautet „gleiches `effectiveAt` → das spätere `observedAt` gewinnt" — bei
identischem `observedAt` greift sie nicht, und es entscheidet die
Einfügereihenfolge. Die zeigt auf den Backfill.

Warum der Backfill so dünn ausfiel: er holt **je Klub eine Historie** mit
750 ms Pause. Der Lauf um 08:28 war der erste nach der 502-Serie; clubelo war
noch instabil, die meisten Historienabrufe scheiterten, und
`backfillSnapshots` legt den Snapshot an, sobald **mindestens ein** Klub ein
Rating hat.

**Ein dünner Snapshot ist schlechter als gar keiner.** Ohne ihn hätte
`findPreMatchSnapshot` auf den letzten vollständigen früheren Snapshot
zurückgegriffen — eine Treppenfunktion, genau wie vorgesehen. Der dünne
Snapshot verdrängt diesen Rückgriff.

### Was das für die Frage „Konstruktion oder Glück" heißt

**Weder noch: ein Defekt.** Die vier getragenen Einträge waren nicht die
Carry-forward-Regel, die einen wirklich abwesenden Klub überbrückt (das war der
Fall bei Bayern und Stuttgart) — es war die Pipeline, die ihren **eigenen**
dünnen Snapshot kompensierte. Braunschweig, St. Pauli, Fürth, Nürnberg,
Dresden, Cottbus und Hannover standen an genau diesen Tagen vollständig im
Archiv.

Die Beobachtung „am Wochenende hat die weiche Entkopplung funktioniert" ist
daher **kein Beleg für Belastbarkeit**. Sie ist die sichtbare Spur eines
Defekts, den ein zweiter Mechanismus verdeckte.

### Und die Konfiguration ist inzwischen eine andere

`--carry-forward-until` ist am 2026-08-11 aus `data.yml` entfernt worden (das
Vorfalls-Instrument, siehe `clubelo.md`). Damit trägt der Pre-Match-Bauer nicht
mehr: dieselbe Konstellation erzeugt künftig **`gap`-Einträge** statt getragener.
Ein Fixture ohne Eintrag hat keine Vorhersage — `predictFixture` liefert `null`,
womit Spieltags-Tendenzen, Szenarien-Vorbelegung und `forecastCompletedSeason`
für dieses Spiel ausfallen. Sichtbar, nicht still; aber spürbar.

Die Entfernung der Flag bleibt richtig. Sie legt den Defekt nur frei, statt ihn
weiter zu verdecken.

## 4 · Die Entkopplungsfrage

### Wo die Kopplung sitzt

Nicht im Abruf, sondern in der Schreibbarriere. `update.mjs` rechnet alles im
Speicher und schreibt erst danach; der clubelo-Abruf steht davor. Der
Abhängigkeitsschnitt selbst ist sauber:

| Artefakt | OpenLigaDB | Ratings |
|---|---|---|
| `season.json` (Spielplan **+ Ergebnisse**), `meta.json` | ✓ | — |
| `outlook.json`, `prematch.json`, `timeline-*`, `playoff.json`, Snapshots | ✓ | ✓ |

### Die geprüften Wege

**A — nur die Schreibbarriere spalten.** Ergebnisse schreiben, Prognose-Artefakte
auslassen. Technisch billig. **Verworfen als Endzustand:** die einzige ehrliche
Veraltungswarnung ist spielplanbasiert und liest *die Ergebnisse*
(`dataState.mjs`). Committet man das Ergebnis ohne neue Prognose, verstummt die
Warnung genau dann, wenn sie gebraucht wird — der Nutzer sähe die Tabelle mit
dem Ergebnis neben einer Prognose, die es nicht kennt, und nichts sagte es ihm.
Das ist ein Rückschritt gegenüber dem heutigen Zustand, in dem der Ausfall
wenigstens sichtbar ist.

**B — zwei Uhren, explizit.** `meta.json` bekommt `resultsUpdatedAt` und
`forecastUpdatedAt`, die App eine zweite Zeile („Prognose berücksichtigt Spiele
bis …"), die Veraltungswarnung eine zweite Bedingung. **Der richtige Weg, wenn
er nötig wird.** Passt zum Haus: Frozen/Live-Timelines und die
Provenienz-Trennung sind bereits Zwei-Uhren-Denken. Kosten: `dataState.mjs`,
Header, jede Seite mit einer Wahrscheinlichkeit, plus eine Zeile in
`grenzfaelle.md`.

**C — Ratings-Ausfall wie fehlende Klubs behandeln**, also
`resolveMissingClubs` mit *allen* Klubs. Verlockend, weil Provenienz,
42-Tage-Decke und „kommt nie ins Archiv" schon existieren. **Verworfen:**
Carry-forward setzt voraus, dass der Klub in der Lücke kein Spiel hatte
(`carryForward.mjs:72-75`) — sonst fällt das Treppenfunktions-Argument. Während
der Saison ist diese Bedingung genau dann verletzt, wenn man den Übertrag
bräuchte. C kauft Robustheit in der Länderspielpause, keine am Spieltag.

**D — nichts umbauen.** Der heutige Zustand.

### Empfehlung

**D bleibt, mit B am Zwei-Schläge-Auslöser** — aber aus einem anderen Grund als
zunächst angenommen. Nicht, weil das Wochenende Belastbarkeit gezeigt hätte
(§3: hat es nicht), sondern weil die Abrufökonomie das Expositionsfenster
tatsächlich auf eines pro UTC-Tag begrenzt und der Schaden eines verpassten
Fensters begrenzt und sichtbar ist.

**Auslösebedingung für B:** ein clubelo-Ausfall, der ein Tagesfenster
**überdauert und dabei einen Spieltag trifft** — also ein UTC-Tag mit
Ligaspielen, an dem **kein** Lauf grün wurde. Am 2026-08-08 war das um ein
knappes Fenster nicht der Fall. Tritt es ein, ist B fällig, nicht A und nicht C.

**Vorrangig vor B** steht allerdings der Fund aus §3. Er ist kleiner, lokal, und
er trifft die Prognosequalität heute schon — anders als B, das einen Fall
absichert, der noch nicht eingetreten ist.

## 5 · Offen

1. **Dünne Backfill-Snapshots** (§3). Nicht behoben. Denkbare Richtungen, keine
   entschieden:
   - Der Backfill überspringt **den heutigen Tag** — der Tagesabruf desselben
     Laufs deckt ihn vollständig ab, der Backfill dafür ist immer redundant.
     Behebt die Kollision an der Wurzel, aber nur für heute.
   - Ein Backfill-Snapshot wird **nur angelegt, wenn er die Klubs abdeckt**, die
     die Fixtures dieses Datums brauchen; sonst bleibt die Lücke offen und der
     Rückgriff auf den letzten vollständigen Snapshot erhalten. Deckt auch
     vergangene Daten ab.
   - Die Verdrängungsregel bei gleichem `observedAt` entscheiden lassen (mehr
     Klubs gewinnt). Pflaster: behandelt das Symptom, nicht die Entstehung.
2. **Weg B**, an seiner Auslösebedingung oben.
3. **Zwei Snapshots gleichen Datums** sind archivrechtlich in Ordnung
   (append-only, Korrektur benennt den Vorgänger). Dass die Verdrängungsregel
   sie bei identischem `observedAt` nicht trennen kann, ist die eigentliche
   Lücke — sie gehört in `grenzfaelle.md`, sobald einer der Wege unter 1
   gewählt ist.
