# Brief — Familien-Audit: Timeline-Cache unter Nachholspielen + Grenzfall-Methode

**Anlass: [USER]-Auftrag, das Projekt auf weitere Fälle der Freeze-Familie
zu untersuchen (Zustandsgrenzen am gespeicherten statt aktuellen Wert;
Cache-/Einfrier-Prämissen, die Verlegungen brechen). Ergebnis: EIN echter
Fund mit drei Gesichtern (§1), eine Bestandsprüfung (§3) und vier benannte
Grenzfall-Kandidaten samt Methode (§4). Untersucht und unauffällig:
Rating-Rekonstruktion (Nachholspiel-Test existiert), `remainingFixtures`
(ergebnis-, nicht zeitbasiert), Snapshot-Archiv (append-only by design),
Provenienz-Klassifikation (rechnet nach dem Freeze-Fix stets mit dem
aktuellen Anstoß), App B (kein Anstoß-Bezug).**

## 1 · Fund: Timeline-Punkte cachen eine gebrochene Prämisse

`buildFrozenTimeline` und die Live-Variante cachen Punkte mit der
Begründung „ein Punkt für einen abgeschlossenen Spieltag kann sich nicht
ändern". Die Prämisse bricht unter Verlegungen dreifach:

1. **Unvollständige Punkte, für immer.** `wanted` prüft `m <= lastPlayed`
   (irgendein späterer Spieltag hat begonnen), nicht ob Spieltag m
   vollständig ist. Ein Punkt für einen Spieltag mit verlegtem Spiel wird
   aus 8 von 9 Ergebnissen gerechnet und nie aktualisiert.
2. **Live-asOf driftet.** Der Rating-Stichtag der Live-Timeline ist
   „Tag nach dem letzten Anstoß des Spieltags" — bei einer Verlegung
   springt der letzte Anstoß Wochen nach hinten, und welcher Stichtag im
   Punkt landet, hängt davon ab, WANN der Cron ihn zuerst berechnet hat.
3. **Zwei Semantiken, ein Artefakt-Typ.** Retroaktiv gebaute
   (historische) Timelines enthalten Nachholspiel-Ergebnisse ihres
   Spieltags; live gewachsene nicht. Damit bricht auch die eigene
   Determinismus-Zusage: Regeneration ≠ committeter Stand, sobald eine
   Saison ein Nachholspiel hatte.

## 2 · Fix: kumulative Vollständigkeit statt `lastPlayed`

**Regel:** Punkt M wird berechnet, sobald **alle Spiele der Spieltage
1–M gespielt sind** — und erst dann. Konsequenzen, alle beabsichtigt:
- Der Zustand von Punkt M ist bei Berechnung **endgültig** — die
  Cache-Prämisse („kann sich nicht ändern") wird wieder wahr, statt
  behauptet.
- Live- und Retro-Bau liefern **identische** Punkte; die
  Determinismus-Zusage (Regeneration bitgleich) gilt wieder uneingeschränkt.
- Der Live-asOf („Tag nach dem letzten Anstoß des Spieltags M") bleibt
  wörtlich bestehen und wird durch die Vollständigkeitsregel
  deterministisch — er ist die im Code bereits dokumentierte Lesart
  „Zustand, sobald der Spieltag komplett ist", jetzt ohne
  Berechnungszeitpunkt-Lotterie.
- Bei einer langen Verlegung **pausiert die Kurve sichtbar** und holt
  nach dem Nachholspiel mehrere Punkte auf einmal nach. Das ist die
  ehrliche Darstellung; ein bedingter Caption-Halbsatz im Verlauf sagt
  es: „Spieltag M noch unvollständig (Nachholspiel) — weitere Punkte
  erscheinen, sobald alle Spiele bis dahin gespielt sind." (§7-Regel:
  rendert nur im Fall.)

## 3 · Bestandsprüfung der live gewachsenen Archiv-Artefakte

Die Saisons, deren Timelines während des Betriebs wuchsen (2025/26,
ggf. 2024/25), können unvollständige oder asOf-verschobene Punkte
enthalten, falls es dort Verlegungen gab. Einmalig: beide Timelines je
Liga aus den committeten Daten regenerieren und gegen den Stand diffen.
Bei Abweichung: **regenerierten Stand committen** (Archiv-Saisons sind
als retrospektive Modellrechnung gelabelt — der Retro-Bau ist dort die
vertragsgemäße Semantik) und den Befund in
`docs/verification/timeline-vollstaendigkeit.md` protokollieren
(Saison, Punkte, Ursache). Keine Abweichung → ebenfalls protokollieren
(„geprüft, deckungsgleich").

## 4 · Grenzfall-Methode + vier benannte Kandidaten

Aus der CC-Selbstdiagnose („die Bedingung getestet, die ich gebaut
hatte, statt die Fälle, die sie treffen muss") wird Arbeitsweise: Für
jede Datums-/Zustandsgrenze eine **Anforderungsfall-Tabelle** (welche
realen Fälle muss sie treffen → je Fall ein Test), beginnend mit den
vier Kandidaten aus dem Inventar — je prüfen, ob der Randtest existiert,
sonst ergänzen:
1. Carry-forward-Decke: exakt 42 Tage erlaubt, 43 nicht.
2. `findPreMatchSnapshot`: Snapshot vom Anstoßtag selbst ist
   ausgeschlossen (strictly before, Datumsgrenze).
3. Provenienz: `observedAt` exakt gleich Anstoß → `backfilled`
   (Gleichheitskante der `<`-Regel).
4. Duell-θ: „beide ≥ 10 %" — Gleichheitsfall inklusive, an beiden
   Konsumenten derselben Funktion.
Die Lektion selbst kommt als Zweizeiler zu den Lektionen in CLAUDE.md
(neben NUL-Byte), wie von [USER] gebilligt.

## 5 · Tests

- Vollständigkeitsregel: Spieltag 5 mit offenem Spiel, Spieltag 6
  komplett → Punkte 5+6 existieren NICHT; Nachholspiel fällt →
  beide erscheinen, Inhalt identisch mit Retro-Bau derselben Daten
  (Äquivalenztest live=retro, der Kern von §1.3).
- Cache: einmal berechneter Punkt bleibt byteidentisch über weitere
  Läufe (No-Churn der Timeline).
- Live-asOf: Verlegung innerhalb des Spieltags → Stichtag folgt dem
  letzten tatsächlichen Anstoß, unabhängig vom Berechnungszeitpunkt
  (zwei Baupfade, gleiches Ergebnis).
- Caption-Halbsatz rendert nur bei unvollständigem Spieltag.
- Die vier §4-Randtests vorhanden (oder nachweislich schon da).
- Bestandssuite ohne Skips; `buildHistorical` unverändert grün.

## 6 · Abnahme

- §2 vor dem nächsten Spieltag mit Verlegungsrisiko deployt (praktisch:
  zeitnah — die Saison läuft ab Freitag); §3-Protokoll liegt vor;
  §4-Tabelle im Repo (`docs/verification/grenzfaelle.md`), Lektion in
  CLAUDE.md.
- Patch-Bump nach stehender Regel (Pipeline-Verhalten mit
  Nutzerwirkung), Tag + Release, Notes nennen die Familie beim Namen.
- CLAUDE.md-Kette und Zustand; das Audit-Ergebnis dieses Briefs ergänzt
  `docs/reviews/` um den internen Sweep (Datum, Umfang, Funde,
  Unauffälliges).
