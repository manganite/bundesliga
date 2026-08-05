# Befund — Pre-Match-Einträge froren vor dem Anstoß ein

**Datum des Befunds: 2026-08-05.** Behoben mit Brief 29
([PREMATCH_FENSTER_BRIEF.md](../briefs/PREMATCH_FENSTER_BRIEF.md)), Release 2.3.3.

Dieses Dokument steht hier, obwohl es kein §11-Gate ist. Die Fundklasse ist der
Grund: **still falsch bis Saisonende.** Der Defekt produzierte keinen roten Lauf,
keine Ausnahme und keine auffällige Zahl — er hätte die Modellgüte einer ganzen
Saison entwertet, und aufgefallen wäre es frühestens im Mai 2027.

## Zahlen

| | Saison 2026/27 (defekt) | Saison 2025/26 (korrekt) |
|---|---|---|
| Einträge | 612 (2 × 306) | 306 je Liga |
| verschiedene Rating-Snapshots | **1** (`clubelo-2026-07-23-…`) | **100** |
| `createdAt` | alle `2026-07-23` | über die Saison verteilt |
| Anstoßtermine | bis **2027-05-23** | Vergangenheit |

Alle 612 Einträge betrafen Spiele, die **noch nicht angestoßen** waren. Die
Verschärfung: die 66 Einträge um Bayern und Stuttgart trugen bereits
`provenance: "carried-forward"` mit den Ratings vom 3. Juli — Schonfristwerte, für
ein Augustspiel zementiert.

## Wurzel

`write-once` ist die richtige Regel und war an der falschen Stelle angewandt.
Ihre Begründung — ein `contemporaneous`-Eintrag darf nicht zu `backfilled`
verfallen, nur weil die Pipeline erneut lief — greift ausschließlich für Spiele,
die **angestoßen** sind. Vorher gibt es nichts zu schützen.

Drei Bausteine ergaben zusammen den Defekt, jeder für sich unauffällig:

1. `buildPreMatchDataset` legte für **jedes** Fixture der Saison sofort einen
   Eintrag an.
2. `findPreMatchSnapshot` kennt keine Fensterbegrenzung — für ein Spiel im Mai
   2027 ist „letzter Snapshot strikt vor Anstoß" zum Laufzeitpunkt zwangsläufig
   der von heute.
3. `if (entries.has(fx.id)) continue` fror das Ergebnis dauerhaft ein.

Warum 2025/26 korrekt aussieht: diese Saison wurde **rückwirkend** gegen ein
vollständiges Archiv gebaut, dort liefert Regel 2 je Fixture den richtigen Tag.
Der Defekt trifft nur den Vorwärtsbetrieb — also genau die laufende Saison.

## Folge, wäre er ungefixt geblieben

Die Modellgüte hätte 34 Spieltage gegen den Stand vom 23. Juli gemessen. Die
Live-vs-Frozen-Gegenüberstellung — der eine belegte Modellvorteil — hätte einen
Datenstand mit sich selbst verglichen und den Vorteil wegdefiniert, ohne dass
irgendeine Prüfung angeschlagen hätte.

## Fundweg — beide Richtungen, ausdrücklich protokolliert

Der Weg gehört mit ins Protokoll, weil die **Beinahe-Verschlimmbesserung** so
lehrreich ist wie der Befund.

1. Anlass war eine Nebensache: die Frage, ob die Carry-forward-Markierung für
   Wolfsburg und Kaiserslautern nach der clubelo-Rückkehr verschwindet. Die
   Antwort war ja (`outlook.json` heilt sich selbst) — beim Gegenprüfen fiel auf,
   dass `prematch.json` es nicht tut.
2. Der Vergleich mit 2025/26 (1 Snapshot gegen 100) machte aus einem „sieht
   komisch aus" einen Befund.
3. Der **erste Fixvorschlag war falsch**: ein Anlege-Fenster von drei Tagen, also
   Einträge nur für bald anstehende Spiele. Er hätte den Defekt beseitigt und
   dabei App A gebrochen.
4. Die Gegenprüfung fand den Grund: **`prematch.json` hat zwei Jobs.** Es ist das
   Provenienz-Protokoll *und* die einzige Quelle der Einzelspiel-Vorhersagen.
   `predictFixture` liefert ohne Eintrag `null`; damit wären Spieltags-Tendenzen,
   die Szenarien-Vorbelegung samt aller Preset-Rezepte und
   `forecastCompletedSeason` ausgefallen — Letzteres hätte die
   Szenario-Schlusstabelle in genau den „fast nur Nullen"-Zustand zurückgeworfen,
   den eine Nutzerkorrektur nach Brief 17 beseitigt hatte.
5. Erst danach stand der tragfähige Fix: **neu berechnen bis Anstoß, einfrieren
   ab Anstoß.** Kein Fenster, keine Löschung, Selbstheilung beim nächsten Lauf.

Die verworfene Variante steht deshalb im Kopf von Brief 29: Wer künftig auf die
Idee kommt, „unnötige" Zukunftseinträge wegzuoptimieren, findet die
Konsumenten-Analyse in der Vorgabekette, statt sie neu zu bezahlen.

## Was den Fix bewacht

- `pipeline/tests/preMatch.test.mjs` — Einfrieren ab Anstoß, Neuberechnung davor,
  Carry-forward-Markierung verschwindet, **No-Churn** (zwei Läufe ohne
  Datenänderung → byteidentisch), **Determinismus** (die Anstoßgrenze folgt dem
  Laufzeitpunkt, nicht der Uhr), lautes Scheitern bei unlesbarem Laufzeitpunkt.
- `apps/public/tests/prematchFenster.test.mjs` — jedes Fixture der committeten
  Saison ist vorhersagbar, die deterministische Vervollständigung füllt alles,
  und `scoredMatches` zählt weiterhin nur gespielte Partien.

## Anmerkung zur Abnahme in Brief 29 §6

Der Brief erwartet als Stichprobe, Bayern–Stuttgart trage nach dem Fix „nach
clubelo-Lage, keine Carry-forward-Kennzeichnung mehr". Das trifft **nicht** zu und
war zum Zeitpunkt der Abfassung schon nicht mehr zutreffend: clubelo führt Bayern
und Stuttgart weiterhin nicht (`npm run gate:clubelo` am 2026-08-05: BL1 16/18).
Zurückgekehrt ist das **BL2**-Paar Wolfsburg/Kaiserslautern.

Nach dem Fix gilt daher, im Probelauf gegen die committeten Daten bestätigt:

- **BL2:** alle 306 Einträge auf dem Snapshot 2026-08-05, `carried-forward` = 0.
  Wolfsburg–Kaiserslautern (1. Spieltag) trägt den aktuellen Snapshot ohne
  Markierung — die Erwartung des Briefs, nur beim anderen Klubpaar.
- **BL1:** alle 306 Einträge auf dem Snapshot 2026-08-05; die 66 Partien um
  Bayern und Stuttgart bleiben `carried-forward` (3. Juli), jetzt aber mit
  aktueller Snapshot-ID statt der vom 23. Juli. Die Markierung verschwindet erst,
  wenn clubelo die beiden Reihen fortführt — spätestens am **2026-08-14** endet
  die 42-Tage-Decke, danach scheitert der Lauf ohne clubelo-Daten fail-closed.
