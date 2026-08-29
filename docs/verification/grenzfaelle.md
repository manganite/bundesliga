# Grenzfälle — Anforderungsfall-Tabelle

**Angelegt 2026-08-05** (AUDIT_FAMILIE §4). Arbeitsweise, nicht Bestandsaufnahme:
Für jede Datums- oder Zustandsgrenze im Projekt steht hier, **welche realen Fälle
sie treffen muss** — und je Fall ein Test.

Der Anlass steht in CLAUDE.md bei den Lektionen: zweimal wurde eine Bedingung
getestet, wie sie gebaut war, statt gegen die Fälle, die sie treffen muss. Beide
Male fand es erst ein fremder Blick. Eine Bedingung zu ändern heißt ab jetzt:
zuerst die Fälle auflisten, dann den Code.

## Die Regel

1. Grenze benennen (welcher Vergleich, welche Einheit — Tage? Datum? Wahrscheinlichkeit?).
2. Fälle auflisten: **darunter, genau darauf, darüber** — und für Zeitgrenzen zusätzlich
   *was passiert, wenn sich der verglichene Wert nachträglich bewegt.*
3. Je Fall ein Test. Fehlt einer, ist die Grenze nicht abgenommen.
4. Hat die Grenze mehrere Konsumenten, wird die Gleichheitskante **an jedem** geprüft.

Schritt 2 zweite Hälfte ist die eigentliche Lehre aus der Freeze-Familie: Eine
Grenze gegen einen *gespeicherten* Wert ist eine andere Grenze als eine gegen den
*aktuellen*.

## Inventar

| # | Grenze | Ort | Fälle | Test |
|---|---|---|---|---|
| 1 | Carry-forward-Decke: 42 Tage erlaubt, 43 nicht | `carryForward.mjs` | 42 ✓, 43 ✗, Flag länger gesetzt ändert nichts | `pipeline/tests/carryForward.test.mjs` — „the 42-day ceiling refuses regardless of the flag" |
| 2 | Pre-Match-Snapshot: **strikt** vor dem Anstoßdatum | `snapshots.mjs` `findPreMatchSnapshot` | Vortag ✓, Anstoßtag ✗, keiner davor → `null` statt Ersatz | `pipeline/tests/snapshots.test.mjs` — „strictly before the kickoff date" |
| 3 | Provenienz: `observedAt < kickoff` | `snapshots.mjs` `provenanceFor` | davor → `contemporaneous`, **exakt gleich → `backfilled`**, danach → `backfilled` | `pipeline/tests/snapshots.test.mjs:162` |
| 4 | Duell-θ: beide Klubs **≥ 10 %** | `metrics.mjs` `directDuels` | beide exakt θ ✓, einer knapp darunter ✗, an **beiden** Konsumenten (`duels`, `historicalDuels`) | `apps/public/tests/grenzfaelle.test.mjs` |
| 5 | Einfrieren eines Pre-Match-Eintrags | `preMatch.mjs` | gespielt ✓, aktueller Anstoß vergangen ✓, **verlegt und ungespielt → taut auf**, Anstoß nachträglich verschoben | `pipeline/tests/preMatch.test.mjs` (Brief 30) |
| 6 | Timeline-Punkt M: alle Spiele **1–M** gespielt | `artefacts.mjs` | Spieltag unvollständig → kein Punkt, Nachholspiel fällt → Punkte holen auf, live = retro | `pipeline/tests/timelineVollstaendigkeit.test.mjs` (Brief 31) |
| 7 | Verdrängung bei **gleichem `effectiveAt`** | `snapshots.mjs` `supersedes` | späteres `observedAt` gewinnt; **`observedAt` exakt gleich → mehr Klubs gewinnt**; auch das gleich → `snapshotId`, damit die Antwort stabil ist; an **allen drei** Konsumenten (`findPreMatchSnapshot`, `findSnapshotOn`, `findSnapshotAsOf`) und in **beiden** Einfügereihenfolgen | `pipeline/tests/duennerSnapshot.test.mjs` |
| 8 | Backfill-Termine: **echt vor** heute | `update.mjs` `backfillDates` | gestern ✓, **heute ✗** (der Tagesabruf desselben Laufs deckt ihn ab), morgen ✗ | `pipeline/tests/duennerSnapshot.test.mjs` — „never covers today" |
| 9 | Backfill-Snapshot: **alle** Klubs oder keiner | `update.mjs` `backfillSnapshots` | vollständig → archiviert, 1 von 3 → gar nichts + Termin bleibt offen, 0 von 3 → dasselbe mit eigener Begründung; danach greift der Rückgriff auf den letzten **vollständigen** früheren Snapshot | `pipeline/tests/duennerSnapshot.test.mjs` |
| 10 | Was zählt als „clubelo nicht erreichbar“ | `sources/clubelo.mjs` `RatingUnavailableError` | Transportfehler ✓ und **5xx** ✓ → Rückgriff erlaubt; **4xx** ✗ (Endpunkt verschoben, Auth neu) und **Integritätsfehler** ✗ (Header, Zeilenzahl, Datumsabdeckung) → weiterhin harter Abbruch, damit Formatdrift laut bleibt | `pipeline/tests/update.test.mjs` — „a 5xx counts as unreachable, a 4xx does not“, „a response that parses wrong is never carried over“ |
| 11 | Reichweite des Rückgriffs | `carryForward.mjs` Regel 5 | Vorabend des Spieltags → getragen; **Spieltag selbst → abgelehnt**, weil ein *geplantes* Spiel in der Lücke liegt, nicht erst ein gespieltes; danach ebenfalls abgelehnt | `pipeline/tests/update.test.mjs` — „the fallback reaches only to the next kickoff“ |
| 12 | Halbserien-Grenze: Spieltage **1–17** | Saisonkonfiguration `herbstmeisterUntilMatchday`, `simulate.mjs` (Tally), `lib/halbserie.js` (Ansichten) | Spieltag 17 gehört zur **Hinrunde**, 18 zur Rückrunde; Anker **einen Spieltag zu früh → offen**, genau darauf → entschieden, danach → weiterhin entschieden; **Nachholspiel aus Spieltag 12 bei gespieltem Spieltag 25 → Hinrunde NICHT fertig** (kumulative Vollständigkeit wie Grenze 6, hier auf die Saisondatei angewandt); fehlende Konfiguration → gar kein Herbstmeister statt geratener 17 | `packages/engine/tests/herbstmeister.test.mjs`, `apps/public/tests/halbserien.test.mjs` |
| 13 | Geteilter Platz **am Anker** | `simulate.mjs`, `lib/halbserie.js` `herbstmeisterFact` | in der Hinrunde hat kein Paar zweimal gespielt, also endet die Spielordnung nach Tordifferenz und Toren und Kriterium 6 gilt nicht — zwei gleichauf stehende Klubs sind **beide** Herbstmeister; Σ P = E[Klubs auf Platz 1] ≥ 1, nie „= 1“, und `sharedProbability` steht daneben | `packages/engine/tests/herbstmeister.test.mjs`, `pipeline/tests/herbstmeisterArtefakte.test.mjs` |
| 14 | Rating-Aktualität: **frisch bis 1 Tag** | `dataState.mjs` `ratingStatus` | heute ✓ frisch, **gestern ✓ frisch** (clubelo veröffentlicht einmal täglich, ein Lauf kann vor der Datei landen — „gestern“ als veraltet zu melden hieße täglich Alarm), vorgestern ✗ veraltet mit Warnung; fehlendes Feld → **gar keine Anzeige** statt „unbekannt“; Archivsaison → nie | `apps/public/tests/ratingUhr.test.mjs` |
| 15 | Rückfall auf das Archiv: **vollständig oder gar nicht** | `snapshots.mjs` `newestCompleteSnapshot` | neuester Snapshot, der **jeden** Klub führt, gewinnt; ein neuerer unvollständiger wird übersprungen (Lehre aus dem Fünf-Klub-Snapshot, §3 des Ausfallberichts); deckt keiner alle Klubs ab → der Lauf scheitert, statt auf einem Loch zu rechnen | `pipeline/tests/update.test.mjs` — „without any complete archived snapshot“ |

Nummern 1–3 waren beim Anlegen der Tabelle **bereits abgedeckt** — geprüft, nicht
nachgetragen. Nummer 4 fehlte die Gleichheitskante; sie ist ergänzt. 5 und 6 sind
die beiden Grenzen, die die Freeze-Familie hervorgebracht hat. 7–9 kommen aus dem
Fund vom 2026-08-11 (`pipeline-ausfallverhalten.md` §3); bei 7 ist die
Gleichheitskante die eigentliche Grenze — sie war vorher gar keine Regel, sondern
fiel auf die Einfügereihenfolge durch. 10 und 11 kommen aus dem clubelo-Ausfall
ab 2026-08-20. Bei 11 ist die Grenze das **geplante** Spiel, nicht das gespielte —
und genau deshalb reicht der Rückgriff bis an den Spieltag heran, aber nicht
hinein. 12 und 13 kommen aus dem Halbserien-Paket: bei 12 ist die eigentliche
Grenze nicht die Zahl 17, sondern die **Vollständigkeit** — ein Nachholspiel aus
dem Dezember hält die Hinrunde im Februar offen, und wer auf „aktueller Spieltag
> 17“ prüft, liegt in genau diesem Fall falsch. 13 ist keine Datumsgrenze,
sondern eine Regelgrenze, und sie ist die Stelle, an der es am meisten juckt,
einen Sieger zu erfinden. 14 und 15 kommen aus der Entkopplung von
Ergebnissen und Ratings: bei 14 ist die Grenze bewusst **weich** (ein Tag), weil
eine tagesgenaue Quelle sonst täglich Alarm auslöst; bei 15 ist die Grenze nicht
das Alter, sondern die **Vollständigkeit** — ein alter vollständiger Snapshot ist
eine vertretbare Grundlage, ein frischer unvollständiger nicht.

## Untersucht und unauffällig (2026-08-05)

Der Sweep der Freeze-Familie hat diese Stellen geprüft und **keinen** Fund ergeben;
sie stehen hier, damit die nächste Runde nicht dieselbe Arbeit bezahlt:

- **Rating-Rekonstruktion** (`reconstruct.mjs`) — Nachholspiel-Test existiert.
- **`remainingFixtures`** — ergebnis-, nicht zeitbasiert; eine Verlegung ändert nichts.
- **Snapshot-Archiv** — append-only by design, kein Zustand, der veralten könnte.
- **Provenienz-Klassifikation** — rechnet seit dem Freeze-Fix stets mit dem
  aktuellen Anstoß.
- **App B** — kein Anstoß- oder Datumsbezug.
