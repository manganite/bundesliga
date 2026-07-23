# Nachträge zu §4 (Metrikdefinitionen)

§4 des Briefs verlangt: *„Every metric below must exist as a documented,
unit-tested function in `packages/engine`. UI and tests consume that function;
neither re-implements it."* Diese Datei führt die Metriken, die **nach** den
Briefen dazugekommen sind, nach derselben Regel — mit Definition, Ort der
Funktion und Datum.

Die Briefe selbst bleiben unverändert; sie sind das Protokoll dessen, was wann
entschieden wurde (siehe [briefs/README.md](briefs/README.md)).

---

## Rating-Aktualität (2026-07-23)

**Ersetzt den in §7 genannten Punkt „Rating-Verzögerung".**

### Definition

Je gespieltem Spiel **und Klub**: das Alter des tatsächlich verwendeten
Pre-Match-Ratings, gerechnet als

```
Alter = Anstoßdatum − effectiveAt des verwendeten Ratings   (in ganzen Tagen)
```

Dargestellt als Verteilung über die Saison — Median und Spannweite —,
**aufgeschlüsselt nach den drei Provenienzen** (`contemporaneous`,
`backfilled`, `carried-forward`), die niemals gepoolt werden.

Die Provenienz wird **je Klub** aufgelöst, nicht je Eintrag: ein Eintrag kann
`carried-forward` sein, weil *ein* Klub übertragen wurde, während der andere sein
Rating regulär aus dem Snapshot bezog. In der laufenden Saison ist genau das der
Normalfall — 64 der 66 übertragenen Einträge betreffen nur einen Klub.

### Caption

Eine **Betriebszahl über den Datenstand der Eingaben**. Keine Aussage darüber, ob
oder wie stark ein Rating der wahren Stärke nachläuft.

### Funktion

`ratingFreshness()` in [`packages/engine/src/modelQuality.mjs`](../packages/engine/src/modelQuality.mjs),
getestet in `packages/engine/tests/modelQuality.test.mjs`. Die App bezieht die
Eingaben über `ratingAgeEntries()` in `apps/public/src/lib/season.js` und
implementiert nichts davon selbst.

### Warum umbenannt

„Rating-**Verzögerung**" verspricht die Messung, dass das Elo der wahren Stärke
träge folgt. Diese Messung findet hier **nicht** statt — und §9 des Briefs ordnet
genau diese Behauptung ausdrücklich als *„reasoning, not measurement"* ein. Unter
der Namensdisziplin von §8 darf ein Label keine Messung suggerieren, die die
Karte nicht macht. Der ehrliche Name ist deshalb **Rating-Aktualität**.

Die andere Lesart — Güte in Abhängigkeit von Ratings aus *k* Tagen nach dem Spiel
— wäre ausdrücklich retrospektiv und benutzt die Zukunft. Sie ist nicht gebaut.

### Warum die Karte trotzdem etwas zu erzählen hat

Vom ersten Spieltag an stehen die Klubs mit übertragenem Rating und ihren 20+
Tagen sichtbar neben den frisch bewerteten. Diese Transparenz war der eigentliche
Zweck des Punkts auf der §7-Liste.

---

## Wichtigstes kommendes Spiel — wo es gerechnet wird (2026-07-23)

Keine neue Definition; §4 definiert die Metrik vollständig. Festgehalten wird
hier nur, **wo** sie entsteht, weil das eine Abnahmebedingung ist:

Die bedingten Verteilungen `P_o(club, target)` werden **während des kanonischen
20 000-Lauf-Artefakts** getallyt, indem dieselben Läufe nach dem simulierten
Ausgang des jeweiligen Spiels gefiltert werden — nie durch eine zweite Simulation
mit erzwungenem Ausgang. Der Rekombinationstest (`q`-gewichtete bedingte
Verteilungen ergeben `P_now`) läuft **in `simulateSeason` selbst**, bevor die
Metrik das Artefakt erreicht: schlägt er fehl, wird nichts geschrieben.

Ausgeliefert wird die **Metrik**, nicht die Roh-Tallies — die wären rund 500 KB
JSON je Liga für Zahlen, die keine Ansicht liest.

Welche zwei Zielverteilungen verglichen werden, steht in der Saisonkonfiguration
(`impactTargets`), nicht im Code.
