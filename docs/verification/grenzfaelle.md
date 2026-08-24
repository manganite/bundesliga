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

Nummern 1–3 waren beim Anlegen der Tabelle **bereits abgedeckt** — geprüft, nicht
nachgetragen. Nummer 4 fehlte die Gleichheitskante; sie ist ergänzt. 5 und 6 sind
die beiden Grenzen, die die Freeze-Familie hervorgebracht hat. 7–9 kommen aus dem
Fund vom 2026-08-11 (`pipeline-ausfallverhalten.md` §3); bei 7 ist die
Gleichheitskante die eigentliche Grenze — sie war vorher gar keine Regel, sondern
fiel auf die Einfügereihenfolge durch. 10 und 11 kommen aus dem clubelo-Ausfall
ab 2026-08-20. Bei 11 ist die Grenze das **geplante** Spiel, nicht das gespielte —
und genau deshalb reicht der Rückgriff bis an den Spieltag heran, aber nicht
hinein.

## Untersucht und unauffällig (2026-08-05)

Der Sweep der Freeze-Familie hat diese Stellen geprüft und **keinen** Fund ergeben;
sie stehen hier, damit die nächste Runde nicht dieselbe Arbeit bezahlt:

- **Rating-Rekonstruktion** (`reconstruct.mjs`) — Nachholspiel-Test existiert.
- **`remainingFixtures`** — ergebnis-, nicht zeitbasiert; eine Verlegung ändert nichts.
- **Snapshot-Archiv** — append-only by design, kein Zustand, der veralten könnte.
- **Provenienz-Klassifikation** — rechnet seit dem Freeze-Fix stets mit dem
  aktuellen Anstoß.
- **App B** — kein Anstoß- oder Datumsbezug.
