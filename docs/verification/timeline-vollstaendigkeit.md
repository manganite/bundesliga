# Bestandsprüfung — Vollständigkeit der committeten Timelines

**Datum: 2026-08-05.** Anlass: AUDIT_FAMILIE §3. Ergebnis: **geprüft,
deckungsgleich — keine Abweichung.**

## Was geprüft wurde

Alle **31** committeten Timeline-Artefakte (`timeline-frozen`, `timeline-live`)
über alle Saisons in `data/seasons/`, je Punkt M:

1. **Vollständigkeit:** Sind *alle* Spiele der Spieltage 1–M gespielt? (Die alte
   Regel verlangte nur, dass irgendein späterer Spieltag begonnen hatte.)
2. **Konsistenz:** Entspricht `playedCount` der Zahl der gespielten Spiele bis M?
3. **Stichtag** (nur live): Ist `asOf` der Tag nach dem letzten Anstoß bis M?

## Ergebnis

```
geprüfte Timelines: 31
Ergebnis: deckungsgleich — keine Abweichung.
```

Die Prüfung ist nicht leer: gegen einen konstruierten Verstoß (Spieltag 1 mit
verlegtem Spiel, Punkt aus 1 von 2 Ergebnissen, Stichtag 2026-08-09 statt
2026-10-21) schlägt sie in beiden Kriterien an.

## Warum nichts zu heilen war — und warum das Glück und nicht Vorsorge ist

Die einzige live gewachsene Saison mit Verlegungen ist **2025/26 BL1**, und dort
gab es zwei erhebliche:

| Spieltag | Zeitspanne | Streuung |
|---|---|---|
| 16 | 2026-01-09 … 2026-01-27 | 18 Tage |
| 17 | 2026-01-13 … 2026-03-04 | **50 Tage** |

Unter der alten Regel hätte Punkt 17 berechnet werden müssen, sobald Spieltag 18
lief — also im Januar, aus 152 von 153 Ergebnissen, und wäre so bis heute
eingefroren. Stattdessen steht dort `playedCount = 153`.

Der Grund ist **nicht**, dass die alte Regel funktionierte, sondern dass die
Artefakte der Saison 2025/26 im Juli 2026 **rückwirkend neu gebaut** wurden
(dieselbe Bauwelle, an der auch alle `prematch.json`-Einträge dieser Saison ihr
`createdAt: 2026-07` tragen). Der Retro-Bau sieht vollständige Daten und liefert
darum vollständige Punkte — genau die Semantik, die der Live-Bau nicht lieferte.
Das ist zugleich der praktische Beleg für Befund §1.3: **zwei Bauwege, zwei
Bedeutungen, ein Artefakttyp.**

Für die laufende Saison 2026/27 gab es nichts zu prüfen: `timeline-live` hat null
Punkte (kein Spiel gespielt), `timeline-frozen` existiert nicht, weil Bayern und
Stuttgart im Vorsaison-Snapshot kein Rating tragen und der Bau darum
ausgesetzt ist.

## Benannte Approximation: der Stichtag im Kreuzungsfall

Der Rating-Stichtag eines Punktes ist **ein** Datum: der Tag nach dem letzten
Anstoß über alle Spieltage ≤ M. Das löst den Widerspruch, den die Regel „letzter
Anstoß des Spieltags M" hinterließe (Ratings vor einem Ergebnis, das der Punkt
enthält) — aber es bleibt eine Näherung, und zwar eine, die hier benannt und
nicht versteckt wird:

**Kreuzen sich Verlegungen, enthält der Stichtag auch Rating-Updates späterer
Spieltage, die dazwischen gespielt wurden.** Enthält Punkt 17 ein Nachholspiel
vom 4. März, so trägt er die Ratings vom 5. März — und die kennen die regulären
Spieltage 18 bis 24, die im Februar liefen.

Das ist unter **jeder** Ein-Datum-Regel unvermeidlich, sobald Kalender und
Spielplan auseinanderlaufen; die Alternative wäre ein Rating je Klub aus je
eigenem Stichtag, also kein Snapshot mehr, sondern eine Konstruktion. Die Kurve
heißt darum weiterhin „Ratings, wie sie nach dem jeweiligen Spieltag galten" und
nicht „Ratings, die genau das Wissen dieses Spieltags abbilden".

## Folge

Kein Commit von regenerierten Ständen nötig. Der Fix wirkt ab der laufenden
Saison — der erste Spieltag mit Verlegungsrisiko ist der, ab dem es zählt.
