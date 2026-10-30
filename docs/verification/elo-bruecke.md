# Elo-Brücke: Ligaergebnisse fortschreiben, solange clubelo schweigt

Gemessen am **2026-10-30**. Reproduzierbar, offline und ohne Netz:

```bash
node pipeline/src/eloBridgeStudy.mjs              # Anker nach Spieltag 1
node pipeline/src/eloBridgeStudy.mjs --anchor-matchday 5
```

Das Skript liest nur committete Daten (`data/training/results/`,
`data/ratings/training-elo/`) und schreibt nichts.

## 1 · Anlass

Der letzte archivierte clubelo-Snapshot ist vom **2026-08-31**. Seitdem ist
`ratings.yml` durchgehend rot (Issue #60). Am 2026-10-30 antwortet
`api.clubelo.com` mit **HTTP 502**, die Website zeigt eine Cloudflare-Prüfseite.
Nachfragen auf X, auch von Dritten, sind bisher ohne konkrete Antwort geblieben.
Ein Termin ist nicht bekannt.

Seit Brief 34 erreichen die Ergebnisse die App trotzdem. Die Prognose rechnet
aber mit Ratings, die sich seit acht Wochen nicht bewegt haben: BL1 ist bis
Spieltag 7 gespielt, BL2 bis Spieltag 9.

Eine fertige Ersatzquelle gibt es nicht. FiveThirtyEight SPI ist eingestellt,
beyondELO bewertet nur Europapokalspiele, Opta-Rankings haben eine andere Skala
und keine geklärte Lizenz. Bibliotheken wie `soccerdata` und `penaltyblog`
fragen dieselbe clubelo-API ab. Eine fremde Skala hieße außerdem neu fitten
(Prozess B): Heimvorteil, BL2-Deltas und `ELO_PER_GOAL` sind auf clubelo-Werte
kalibriert.

Die Frage war deshalb: Wie gut folgt eine **Brücke** der echten clubelo-Reihe?
Die Brücke startet beim letzten echten Wert und schreibt nur aus den
OpenLigaDB-Ligaergebnissen fort.

## 2 · clubelos Update-Regel, aus den Daten geschätzt

Für jedes Ligaspiel 2011/12–2025/26 beider Ligen liegt das clubelo-Rating
beider Klubs vom Vortag vor. Die Differenz zum Wert vor dem nächsten Ligaspiel
ist die beobachtete Änderung. Sie enthält aber auch Pokal- und Europapokalspiele
dazwischen.

**Sauber** heißt hier: Die Änderungen von Heim- und Gastklub heben sich auf
0,01 Elo genau auf. Dann lag bei keinem der beiden ein anderes Spiel dazwischen.
Das trifft auf **4142 von 8910** Spielen zu, die ein Folgespiel haben. Nur 33
weitere liegen zwischen 0,01 und 0,05; die Schwelle schneidet also keine
nennenswerte Gruppe ab.

Was die sauberen Spiele zeigen, ohne angenommene Form:

- Die Änderung hängt von der **Tordifferenz** ab, nicht vom Ergebnis. Bei
  |Elo-Differenz| < 40 bringen 1:0, 2:1 und 3:2 je etwa +6,6 und 0:0, 1:1 und
  2:2 je etwa −1,5 für den Heimklub.
- Sie fällt gleichmäßig mit dem Elo-Abstand.
- Ein Remis zwischen Gleichstarken kostet den Heimklub Punkte, die Erwartung
  enthält also einen Heimvorteil.

Die Form, die das trägt:

```text
Δ = K · w(g) · (S − E(dr + H))      E(x) = 1 / (1 + 10^(−x/400))
w(0) = 1,  w(g) = a · √g  für g ≥ 1
```

| Parameter | Wert (alle sauberen Spiele) |
|---|---|
| K | 19,83 |
| a | 0,807 |
| H | 57 Elo |
| Restfehler (RMSE) | **0,52 Elo je Spiel** |

**Das ist eine Schätzung, nicht clubelos Formel.** Sie ist nirgends gegen eine
Veröffentlichung des Betreibers geprüft. Den √g-Verlauf zeigen die Daten selbst:
Frei je Tordifferenz geschätzt liegen die Gewichte bei 0,815 / 1,142 / 1,389 /
1,595 / 1,790, und 0,815·√g liefert 0,815 / 1,153 / 1,412 / 1,630 / 1,822.

**Der Heimvorteil ist nicht konstant.** Je Saison geschätzt liegt er zwischen
42 (2020/21, Geisterspiele) und 70. Mit dem Saisonwert sinkt der Restfehler auf
0,36–0,69. clubelo führt den Heimvorteil offenbar dynamisch. Ob er je Land oder
je Liga geführt wird, geben diese Daten nicht her. Hier geschätzt ist er
gemeinsam über BL1 und BL2.

## 3 · Rückwirkender Test

Für jede Saison 2012/13–2025/26:

- **Anker:** der echte clubelo-Wert jedes Klubs vor seinem ersten Spiel nach
  Spieltag 1. Das entspricht der heutigen Lage: Der Snapshot vom 31.08. liegt
  nach dem 1. BL1-Spieltag.
- **Brücke:** ab dort nur Ligaergebnisse, mit der Regel aus §2.
- **Kein Blick in die Zukunft:** K und a sind **ohne** die getestete Saison
  gefittet, H nur auf der **Vorsaison**.
- **Vergleich:** eingefrorene Ratings, also der heutige Betrieb.
- **Gemessen** wird an jedem späteren Spiel gegen den echten clubelo-Wert.

Das Modell verwendet nur die **Elo-Differenz** (`eloToLambdas` in
`packages/engine/src/model.mjs`: `eloHome − eloAway + HOME_ADV`). Maßgeblich
ist deshalb die Spalte „Differenz". Das absolute Niveau eines Klubs geht nicht
in die Prognose ein.

Mittlerer absoluter Fehler in Elo, beide Ligen:

| Spieltag | Klub: Brücke (Mittel / p90) | Klub: eingefroren (Mittel / p90) | **Differenz: Brücke** | **Differenz: eingefroren** |
|---|---|---|---|---|
| 5 | 4,2 / 10,1 | 13,5 / 28,2 | **2,7** | **17,4** |
| 10 | 11,6 / 28,4 | 24,0 / 48,4 | **5,2** | **29,9** |
| 15 | 14,3 / 28,7 | 30,0 / 62,2 | **5,9** | **37,9** |
| 20 | 15,3 / 34,9 | 33,4 / 70,7 | **6,3** | **46,1** |
| 25 | 15,1 / 29,6 | 36,7 / 74,9 | **6,7** | **49,7** |
| 30 | 13,7 / 28,7 | 38,7 / 79,6 | **7,4** | **52,5** |
| 34 | 15,6 / 31,6 | 40,3 / 82,1 | **7,6** | **54,1** |

Fehler der Elo-Differenz am 34. Spieltag, Spanne über die 14 Saisons:

| Liga | Brücke | eingefroren |
|---|---|---|
| BL1 | 6,5–16,5 | 27,3–89,9 |
| BL2 | 2,8–6,8 | 27,9–73,0 |

Die Einzelwerte je Saison gibt das Skript aus.

**Lesart:**

- Nach zehn Spieltagen liegt die Brücke bei der Differenz rund **sechsmal
  näher** an clubelo als der eingefrorene Stand.
- In der BL2 bleibt sie über eine ganze Saison unter 7 Elo.
- In der BL1 ist der Fehler etwa doppelt so groß.
- Beim absoluten Klubniveau wächst der Fehler bis etwa Spieltag 15 und bleibt
  dann bei etwa 15. Das passt zu Europapokal- und Pokalpunkten, die clubelo
  verbucht und die Brücke nicht kennt. Gemessen ist diese Zuordnung **nicht**:
  Der Unterschied zwischen BL1 und BL2 legt sie nahe, zerlegt ist er nicht.

**Grenzen der Messung:**

- Die Anker sind echte clubelo-Werte. Ein Anker, der selbst schon veraltet ist,
  kommt im Test nicht vor.
- Die Tests decken 2012–2025 ab. Ob clubelo nach dem Relaunch dieselbe Regel
  rechnet, ist unbekannt. Es wird sich erst am ersten neuen Snapshot zeigen
  (§5).

## 4 · Quellen für Pokal und Europapokal

**DFB-Pokal: Ergebnisse vorhanden, nur ein Teil verwendbar.**

- OpenLigaDB führt den Pokal mit **63 von 63** Spielen je Saison für
  2011/12–2025/26 (abgerufen am 2026-10-30).
- Die Daten werden von der Community gepflegt. Das **Kürzel wechselt** je
  Saison (`dfb11`, `dfb12`, `dfb2013` … `dfb2022`, ab 2023 `dfb`).
- Die Ergebnisarten sind **uneinheitlich benannt**, mit wechselnden
  `resultTypeID`s: „Nach 90 Minuten", „nach Verlängerung", „Verlängerung",
  „Nachspielzeit", „Elfmeterschießen". Was „Endergebnis" meint, unterscheidet
  sich zwischen den Saisons.
- 2026/27 hat bisher **48 Spiele**. **17** davon sind zwischen zwei Klubs, die
  ein Rating haben (4 in Runde 1, 13 in Runde 2). **31** sind gegen
  unterklassige Gegner ohne Rating; die lassen sich ohne geratenen Wert nicht
  verbuchen.
- Offen: Wie clubelo Pokalspiele gewichtet und wie es Verlängerung, Elfmeter
  und den neutralen Finalort behandelt. Das lässt sich an den
  **nicht-sauberen** Intervallen aus §2 messen, sobald die Pokalergebnisse
  fail-closed geparst sind. Gemacht ist es nicht.

**Europapokal: nicht verwendbar.**

- OpenLigaDB führt die Champions League 2026/27 (`ucl`, 144 Spiele, 54
  beendet). Europa League und Conference League waren unter den naheliegenden
  Kürzeln nicht zu finden.
- Entscheidend sind aber die **Gegner-Ratings**. Das Archiv hält nur die 36
  deutschen Klubs. Die volle Tages-CSV vom 31.08., die alle europäischen Klubs
  enthielt, ist nicht archiviert. Ein Europapokalspiel zu verbuchen hieße, das
  Rating des Gegners zu raten.

## 5 · Was beim Wiederkommen von clubelo passiert

- Der erste neue clubelo-Snapshot ist der Abgleich. Er zeigt den tatsächlichen
  Fehler der Brücke unter echten Bedingungen.
- Er zeigt auch, ob die Regel nach dem Relaunch noch gilt. Gilt sie nicht,
  steht das hier mit Datum. Es ist dann kein Grund, die Brücke nachträglich zu
  korrigieren: Ihre Werte waren Schätzungen und als solche gekennzeichnet.

## 6 · Befund am Rand: zwei Monate alte Ratings heißen „contemporaneous"

Stand 2026-10-30 stehen in `prematch.json` **108 gespielte Partien** (54 je
Liga) auf dem Snapshot vom 31.08., alle mit `provenance: "contemporaneous"`.
Formal stimmt das: Der Snapshot wurde vor dem Anstoß beobachtet, das ist die
Definition. Brief 34 hat die Regel bewusst so gelassen („ein gestriger
Snapshot für ein heutiges Spiel **ist** contemporaneous").

Einen Ausfall über acht Wochen hatte diese Regel nicht im Blick. Modellgüte
mischt diese Partien heute mit wirklich zeitnahen. Die Einträge sind
eingefroren und werden **nicht** umgeschrieben. Das Alter des Snapshots lässt
sich aber aus vorhandenen Feldern ablesen (`snapshotEffectiveAt` gegen
`kickoff`). Was daraus folgt, entscheidet der Brief.
