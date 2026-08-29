# Brief — Ergebnisse und Ratings entkoppeln, Takt an den Spielplan

**Anlass (Nutzer, 2026-08-29): „Clubelo hat zu viele Aussetzer und das blockiert
immer wieder die Aktualisierung der Daten." Drei mehrtägige clubelo-Ausfälle in
einer Saison, und jedes Mal erreichten auch die Ligaergebnisse die App nicht —
obwohl die Ergebnisquelle gesund war. Version: 2.5.0 (Feature).**

## 0 · Die Kopplung, und warum sie fiel

Das Ratings-Tor saß **vor jedem Schreibvorgang**. `update.mjs` kommentierte das
schon: „because the ratings gate sits before everything, ‚no ratings' meant ‚no
data at all', results included." Als Default war das vertretbar; nach drei
Ausfällen ist es der Hauptausfallgrund.

Der Schnitt verläuft **nicht** zwischen „Ergebnisse" und „Elo", sondern zwischen
drei Artefaktklassen mit verschiedenen Ehrlichkeitsanforderungen:

1. **Ergebnisse** (`season.json`) — hängen an clubelo überhaupt nicht.
2. **Prognose** (`outlook.json`, Timelines) — darf mit dem neuesten verfügbaren
   Rating rechnen, **sichtbar gestempelt**. Das ist gekennzeichnete Veraltung,
   keine Falschaussage.
3. **Pre-Match-Provenienz** (`prematch.json`) — bleibt unangetastet. Sie liest
   ohnehin aus dem Archiv (`findPreMatchSnapshot`: neuester Snapshot **streng
   vor** Anstoß) und ist damit während eines Ausfalls von selbst korrekt: ein
   gestriger Snapshot für ein heutiges Spiel **ist** contemporaneous.

Der Unterschied zwischen 2 und 3 trägt den ganzen Brief: „unsere aktuelle
Schätzung mit alten Stärken" ist ehrlich, „dieses Rating galt damals" wäre eine
Behauptung über die Vergangenheit, die falsch sein kann.

**Verworfen: Weg A** aus `pipeline-ausfallverhalten.md` §4 (nur die
Schreibbarriere spalten). Die spielplanbasierte Veraltungswarnung liest die
*Ergebnisse*; committet man sie ohne neue Prognose, verstummt sie genau dann,
wenn sie gebraucht wird. §2 ist die Bedingung, unter der 1 überhaupt erlaubt ist.

## 1 · Pipeline

- `runUpdate({ fetchRatings })`, CLI `--no-ratings-fetch`. Ohne Abruf kommt die
  Rating-Grundlage aus `newestCompleteSnapshot` — dem neuesten Snapshot, der
  **jeden** Klub führt. Vollständigkeit statt Aktualität, weil ein dünner
  Snapshot schlechter ist als ein alter (§3 des Ausfallberichts, teuer gelernt).
  Deckt keiner alle Klubs ab, scheitert der Lauf.
- Auf diesem Pfad wird **nichts archiviert** und keine Provenienz „live"
  behauptet; die Klubs tragen `archived` mit dem echten Datum.
- **Kein neues Instrument.** `--carry-forward-until` bleibt, was es ist: der
  Vorfallschalter für einen Klub, den clubelo nicht mehr führt. Es ist nicht
  dieser Schalter und ersetzt ihn nicht.

## 2 · Zwei Uhren

`meta.json` bekommt `resultsUpdatedAt` und `ratingsEffectiveAt` neben dem
unveränderten `dataUpdatedAt`; `outlook.json` trägt `ratingsEffectiveAt` mit.
Beide bleiben reine Funktionen der Eingaben — sonst bricht „commit only on
change".

`ratingStatus()` (Engine, getestet): frisch bis **einschließlich gestern**.
clubelo veröffentlicht einmal täglich und ein Lauf kann vor der Datei landen;
„gestern" als veraltet zu melden hieße täglich Alarm und würde die Warnung
wertlos machen. Ab zwei Tagen: orange plus ein Satz, der auch sagt, dass
**Ergebnisse und Tabelle aktuell sind** — ohne diese Hälfte misstraut der Leser
der Tabelle gleich mit.

Die Zeile steht in der Kopf-Metazeile, das Datum immer ausgeschrieben; Farbe ist
Akzent, nie alleiniger Bedeutungsträger. Im Archiv rendert sie nie.

## 3 · Zwei Workflows, zwei Kanäle

- **`data.yml` → „Ergebnisse aktualisieren"**, alle 15 Minuten, `--no-ratings-fetch`,
  committet nur `data/seasons` + `data/meta.json`, stößt den Deploy an.
- **`ratings.yml` → „Ratings aktualisieren"**, stündlich, `ratingsCli.mjs`,
  committet nur `data/ratings`, stößt **keinen** Deploy an (ein neues Rating
  ändert nichts Sichtbares, bis der Ergebnislauf es Minuten später aufnimmt).

Getrennte `betrieb`-Kanäle sind der Kern: sonst färbt der eine Ausfall wieder
den anderen Melder rot.

**Die Höflichkeitsregel bleibt unverändert** — der Abruf entfällt, sobald der
heutige Stand im Archiv liegt, also eine Anfrage pro Tag im Normalbetrieb. Der
Fünfzehn-Minuten-Takt kostet nichts, weil dieser Job clubelo nicht anfasst.

## 4 · Tests

- **Verhalten:** ein Lauf mit `fetchRatings: false` gegen ein `fetchText`, das
  bei jedem Aufruf wirft — er muss durchlaufen und schreiben. Dazu: nichts
  archiviert; ohne vollständigen Snapshot scheitert er laut.
- **Kette:** `entkopplung.test.mjs` prüft die vier Glieder (Schalter gesetzt,
  Ratings-Job vorhanden, disjunkte `git add`-Pfade, getrennte Kanäle) und testet
  sich gegen jedes einzeln gebrochene — wie der Deploy-Wächter nebenan.
- **Uhr:** Grenzen heute/gestern/vorgestern, fehlendes Feld, Archiv.
- Grenzfall-Zeilen 14 und 15 (Pflicht aus CLAUDE.md).

## 5 · Abnahme

Suite ohne Skips; ein echter Lauf mit `--no-ratings-fetch` gegen die Live-Daten,
der die Ergebnisse eines clubelo-Ausfalltages einbringt; Statuszeile in beiden
Zuständen angesehen; 2.5.0 mit Tag + Release.
