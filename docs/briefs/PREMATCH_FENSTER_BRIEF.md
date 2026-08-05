# Brief — Pre-Match-Einträge: neu berechnen bis Anstoß, eingefroren ab Anstoß

**Dringend: vor dem BL2-Start am 7. August. Revidierte Fassung — die
ursprüngliche Fenster-Variante hätte App A gebrochen (Befund der
CC-Gegenprüfung, verifiziert): `prematch.json` hat ZWEI Jobs. Sie ist das
Provenienz-Protokoll der Modellgüte UND die einzige Quelle der
Einzelspiel-Vorhersagen — `predictFixture` liefert ohne Eintrag null,
womit Spieltage-Tendenzen, die Szenarien-Vorbelegung samt aller
Preset-Rezepte und `forecastCompletedSeason` ausfallen würden. Ein
Anlege-Fenster ist damit vom Tisch; der Fix ist die Neuberechnung.**

## 1 · Befund (verifiziert, beide Seiten)

- `data/seasons/2026/{bl1,bl2}/prematch.json`: **612 Einträge aus genau
  EINEM Snapshot** (`clubelo-2026-07-23-…`), alle für noch nicht
  angestoßene Spiele — bis Mai 2027.
- Vergleich 2025/26: 306 Einträge aus **100 verschiedenen** Snapshots
  (rückwirkend gegen vollständiges Archiv gebaut, deshalb korrekt).
- Verschärfung: Bayern–Stuttgart (28.08.) trägt bereits
  `provenance: "carried-forward"` mit 3.-Juli-Ratings — Schonfrist-Werte,
  für ein Augustspiel zementiert, obwohl clubelo wieder liefert.
- Kein Ersetzungspfad: sofortiges Anlegen für jedes Fixture +
  `if (entries.has(fx.id)) continue` friert dauerhaft ein.
- **Folge, wenn ungefixt:** Modellgüte misst 34 Spieltage gegen den
  23. Juli; Live-vs-Frozen wird sinnlos — der eine belegte Modellvorteil
  (Live schlägt Frozen) wäre wegdefiniert, unbemerkt.

## 2 · Der Fix: Neuberechnung statt Fenster

- **Einträge existieren für ALLE Fixtures der Saison** — App A behält
  jede Vorhersage, von Spieltag 1 bis 34, wie heute.
- **Bis zum Anstoß wird jeder Eintrag bei jedem Lauf neu berechnet:**
  bester Snapshot strikt vor dem Anstoßdatum gewinnt (Regel unverändert),
  Carry-forward-Kennzeichnungen entstehen und verschwinden mit dem
  Datenstand.
- **Ab Anstoß eingefroren:** `kickoff <= Laufzeitpunkt` → der Eintrag ist
  autoritativ und wird nie mehr angefasst. Das ist die §5.3-Zusage
  (contemporaneous verfällt nicht zu backfilled), jetzt an der Stelle
  angewandt, an der sie gilt. Damit trägt jeder Eintrag im Moment des
  Anstoßes exakt den letzten Vor-Anstoß-Rechenstand — das ist die
  Definition von Pre-Match.
- Die Gap-Meldung bleibt als Mechanik bestehen (sie wird praktisch
  gegenstandslos: für künftige Spiele existiert immer ein Snapshot
  davor).
- Die Modellgüte bleibt sauber, weil `scoredMatches` ausschließlich über
  gespielte Fixtures iteriert — das wird per Test verankert statt nur
  festgestellt (§4).

## 3 · Bestandsdaten: Selbstheilung statt Löschung

Keine Bereinigung nötig — die 612 falschen Einträge sind sämtlich für
ungespielte Fixtures und werden beim **ersten Lauf nach dem Fix**
regulär neu berechnet. Der Commit dieses Laufs dokumentiert im Text, dass
damit der protokollierte Defekt behoben ist.

## 4 · Zwei Fallen — Teil der Spezifikation, nicht Fußnoten

1. **Substanz-Regel gegen Commit-Rauschen:** Ein neu berechneter Eintrag
   wird nur dann geschrieben (und `createdAt` nur dann aktualisiert),
   wenn sich seine **Substanz** ändert: Snapshot-ID, Elo-Werte,
   Provenienz oder carriedFrom. Sonst bleibt die Datei byteidentisch —
   die „commit only on change"-Regel aus CLAUDE.md gilt wörtlich; ohne
   diese Regel committete und deployte der Cron alle zwei Stunden eine
   inhaltsgleiche Datei.
2. **Determinismus:** Die Anstoß-Grenze bindet an den **Laufzeitpunkt**
   (`observedAt`, wie er `buildPreMatchDataset` bereits erreicht), nie an
   `Date.now()`. Ein `--as-of`-Neuaufbau bleibt damit deterministisch,
   und die Tests hängen nicht an der Uhr.

## 5 · Tests

- Fixture in 60 Tagen → Eintrag **existiert** und `predictFixture`
  liefert eine Vorhersage (das Gegenstück zu dem, was die
  Fenster-Variante gebrochen hätte).
- Neuer Snapshot, Spiel nicht angestoßen → Eintrag aktualisiert
  (Snapshot-ID, Elo neu).
- Nach Anstoß → Eintrag unverändert trotz neuerem Snapshot
  (Einfrier-Regressionstest).
- Carry-forward: Kennzeichnung im Eintrag; clubelo kehrt zurück, Spiel
  nicht angestoßen → Kennzeichnung weg.
- **No-Churn:** zwei Läufe ohne Datenänderung → Datei byteidentisch.
- **Determinismus:** `--as-of`-Lauf zweimal → byteidentisch; Grenze folgt
  dem as-of-Zeitpunkt, nicht der Uhr.
- `scoredMatches` ignoriert Einträge ungespielter Fixtures (Anker).
- `buildHistorical` unberührt (Bestandstests grün).

## 6 · Abnahme

- Fix vor dem 7. August auf `main`; erster Lauf danach ersetzt die 612
  Einträge (Stichprobe: Bayern–Stuttgart trägt aktuellen Snapshot und,
  nach clubelo-Lage, keine Carry-forward-Kennzeichnung mehr).
- Alle §5-Tests grün, Gesamtsuite ohne Skips; **Patch-Bump**, Tag +
  Release, Notes nennen den Defekt beim Namen.
- Protokoll in `docs/verification/` (Datum, Zahlen, Wurzel, Fundweg
  inklusive der Gegenprüfung, die die Fenster-Variante gestoppt hat) —
  die Fundklasse „still falsch bis Saisonende" gehört dokumentiert.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
