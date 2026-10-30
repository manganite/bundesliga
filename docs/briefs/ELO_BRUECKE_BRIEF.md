# Brief — Elo-Brücke aus Ligaergebnissen, solange clubelo schweigt

**Status: Entwurf zur Prüfung (2026-10-30).** Wird mit dem Merge dieses PRs
verbindlich. Die mit **[Entscheidung]** markierten Punkte sind offen und
gehören vorher beantwortet.

**Anlass (Nutzer, 2026-10-30):** „Clubelo ist immer noch down. Und es ist nicht
absehbar, wann es wieder online geht." Der letzte Snapshot ist vom 2026-08-31.
Nachfragen beim Betreiber auf X sind bisher ohne Antwort. Der Nutzer hat
entschieden: falls sich weiter nichts tut, kommt eine Brücke, und sobald
clubelo wieder liefert, gelten wieder dessen Werte. **Version: 2.6.0
(Feature).**

## 0 · Was gemessen ist

Alle Zahlen stehen in `docs/verification/elo-bruecke.md` und lassen sich mit
`node pipeline/src/eloBridgeStudy.mjs` offline reproduzieren.

- **clubelos Update-Regel lässt sich aus den committeten Daten schätzen.**
  - Grundlage sind 4142 saubere Ligaspiele 2011–2025, bei denen kein anderes
    Spiel dazwischenlag.
  - Form: `Δ = K · w(g) · (S − E(dr + H))`, mit `w(0) = 1` und
    `w(g) = a·√g`.
  - Werte: K ≈ 19,8, a ≈ 0,81, H ≈ 57.
  - Restfehler: 0,52 Elo je Spiel.
  - Es ist eine **Schätzung**, nicht die veröffentlichte Formel.
- **Rückwirkender Test** mit Anker nach Spieltag 1, ohne Daten aus der
  getesteten Saison. Fehler der Elo-Differenz, der einzigen Größe, die das
  Modell liest:

  | | nach 10 Spieltagen | nach 34 Spieltagen |
  |---|---|---|
  | eingefroren (heutiger Betrieb) | 30 | 54 |
  | Brücke | 5 | 8 |

  - BL2 bleibt die ganze Saison unter 7.
  - BL1 liegt bei 6–17, vermutlich wegen Pokal und Europapokal (nicht zerlegt).

Der Brief stützt sich nur auf diese Messung. Kein Parameter wird geraten.

## 1 · Was die Brücke ist — und was nicht

- **Ein Rechenwert, kein Rating.** Die Brücke entsteht im Speicher als reine
  Funktion aus dem Anker-Snapshot, den gespielten Ligaergebnissen seit dem
  Anker und den festen Parametern aus §2. Kein Zustand, kein Zufall, keine Uhr.
  Gleiche Eingaben ergeben bitgleiche Werte. Ein `--as-of`-Neuaufbau trifft
  denselben Wert.
- **Nie im Archiv.** `data/ratings/` enthält weiter nur, was clubelo
  veröffentlicht hat. Dieselbe Regel gilt schon für übertragene Werte.
- **Anker = `newestCompleteSnapshot`.** Es ist derselbe Snapshot, auf den der
  Ergebnispfad aus Brief 34 heute schon zurückgreift. Vollständigkeit vor
  Aktualität bleibt.
- **Nur Ligaspiele beider Ligen.** Pokal und Europa bleiben in V1 der Brücke
  draußen; siehe §6.
- **Bezugsrahmen:** Die Brücke läuft je Liga in einem geschlossenen System.
  Ein Klub tauscht Punkte nur mit Ligakonkurrenten. Das ist die Annahme, die
  der Test gemessen hat. Sie wird nicht stillschweigend erweitert.
- **Reihenfolge** der Updates: nach Anstoß, dann `fixtureId`.
  - Tragend ist nur die chronologische Folge **je Klub**. Spiele mit gleichem
    Anstoß betreffen verschiedene Klubs, ihre Updates berühren disjunkte Werte
    und vertauschen sich darum auch in Fließkomma exakt.
  - Die `fixtureId`-Stufe ist also keine Korrektur, sondern macht die
    Reihenfolge eindeutig. Ein Test hält die Vertauschbarkeit fest (§8).

## 2 · Parameter

- **K und a** werden einmal aus allen sauberen Spielen 2011–2025 geschätzt und
  als Konstanten committet, mit Herkunftsvermerk auf die Studie. Ein Test
  rechnet sie aus den Trainingsdaten nach.
- **H** (Heimvorteil der Brücke) wird auf der **Vorsaison** geschätzt, also
  2025/26 für 2026/27, genau wie im rückwirkenden Test. Ebenfalls committet,
  ebenfalls nachgerechnet.
- Die Brücken-Parameter sind **nicht** die Modellparameter
  (`HOME_ADV`, `ELO_PER_GOAL`). Sie beschreiben clubelos Update, nicht unsere
  Torvorhersage. Beides bleibt getrennt benannt, damit niemand den einen Wert
  für den anderen hält.
- **[Entscheidung] H nachführen?** Die Daten zeigen, dass clubelo den
  Heimvorteil dynamisch führt (42–70 je Saison). V1 hält H fest, so wie
  gemessen. Ein mitlaufendes H wäre eine zweite, ungemessene Regel.

## 3 · Wann die Brücke rechnet

**[Entscheidung] Schalter oder Automatik.**

- **Vorschlag: Schalter.** `--elo-bridge-until <datum>` steht in `data.yml`,
  mit begründetem Ablaufdatum, und wird nach dem Vorfall **wieder entfernt**.
  Das folgt der Linie von `--carry-forward-until`: Ein Vorfallsinstrument ist
  sichtbar im Workflow, kein Dauerzustand. Ohne den Schalter ändert sich am
  heutigen Verhalten nichts.
- **Alternative: Automatik** ab N Tagen Rating-Alter. Sie wäre bequemer, aber
  die Brücke liefe dann ohne menschliche Entscheidung über Monate. Das ist
  genau das, was die Carry-forward-Episode vermeiden sollte.
- **Kein Deckel wie die 42 Tage.** Der Test zeigt keinen Punkt, an dem die
  Brücke schlechter würde als der eingefrorene Stand: Der Fehler der Differenz
  wächst von 5 auf 8, der des Status quo von 30 auf 54. Die harte Grenze ist
  stattdessen das Saisonende. Über eine Sommerpause mit Kaderwechseln trägt
  keine Messung, und die Brücke darf nicht in eine neue Saison laufen.

## 4 · Provenienz und Modellgüte

- **Pre-Match-Einträge auf Brückenwerten** tragen
  `provenance: "bridged"`, `bridgeAnchor: <snapshotId>` und
  `bridgeMatchCount: <n>`, die Zahl der verbuchten Spiele je Klub als
  Höchstwert. Der Wert steht neben `contemporaneous`, `backfilled` und
  `carried-forward`. **Nie gepoolt** (§8). Modellgüte zeigt die Gruppe
  getrennt oder gar nicht.
- **Brief 29/30 gilt unverändert:**
  - Bis zum Anstoß wird neu gerechnet, ab Anstoß eingefroren.
  - Ein Brückenwert, der sich durch ein neues Ergebnis bewegt, ist eine
    **substanzielle** Änderung und bewegt die Datei. Darum stehen `eloHome`
    und `eloAway` schon in der Substanz-Liste. Ein Lauf ohne neues Ergebnis
    bewegt nichts.
- **[Entscheidung] Die 108 alten Einträge.** Stand 2026-10-30 stehen 108
  gespielte Partien als `contemporaneous` auf dem Snapshot vom 31.08.
  (`elo-bruecke.md` §6).
  - Vorschlag: die Einträge **nicht umschreiben**, sie sind eingefrorenes
    Protokoll.
  - Stattdessen trennt Modellgüte nach **Snapshot-Alter beim Anstoß**, also
    `kickoff − snapshotEffectiveAt`. Die Schwelle muss mit Begründung gewählt
    werden. Ein Kandidat sind 7 Tage: Länger als eine englische Woche hat
    clubelo im Normalbetrieb nie geschwiegen. Das ist am Archiv nachzuprüfen,
    nicht anzunehmen.
  - Das ist reines Lesen vorhandener Felder.

## 5 · Rückkehr zu clubelo

- **Ohne Eingriff:** Der erste neue vollständige Snapshot wird neuer Anker
  (`newestCompleteSnapshot`). Seit ihm liegen null Spiele zwischen Anker und
  Prognose, die Brücke ist damit leer. Danach wird der Schalter entfernt.
- **Offene Einträge tauen um:** Pre-Match-Einträge noch nicht angestoßener
  Spiele rechnen auf dem echten Snapshot neu und wechseln zu
  `contemporaneous`. Das ist Brief 29, kein neuer Mechanismus.
- **Eingefrorene `bridged`-Einträge bleiben stehen**, als Protokoll dessen,
  womit damals gerechnet wurde.
- **Der Abgleich wird festgehalten:** Brücke gegen den ersten echten Snapshot,
  je Klub und als Differenzfehler, in `elo-bruecke.md` mit Datum. Das ist die
  einzige Messung unter echten Bedingungen. Sie zeigt auch, ob clubelo nach
  dem Relaunch noch dieselbe Regel rechnet.
- **Rückgriff:** Liegt der Fehler deutlich über dem rückwirkenden Test, ist
  das ein Befund und kein Anlass, die Brücke nachträglich zu korrigieren.

## 6 · Pokal und Europa — nicht in V1

- **DFB-Pokal:**
  - OpenLigaDB führt ihn vollständig (63/63 je Saison 2011–2025). Die Daten
    sind aber Community-gepflegt, das Kürzel wechselt je Saison, und die
    Ergebnisarten sind uneinheitlich benannt.
  - 2026/27 sind 17 von 48 Spielen zwischen zwei Klubs mit Rating.
  - Spiele gegen unterklassige Gegner lassen sich ohne geratenen Wert nicht
    verbuchen.
  - Ein Folge-Brief braucht zwei Gates:
    - **G1:** ein fail-closed Parser für 90 Minuten, Verlängerung und Elfmeter
      über alle Kürzel.
    - **G2:** clubelos Pokal-Behandlung (Gewicht, Verlängerung, Elfmeter,
      neutraler Finalort) an den nicht-sauberen Intervallen gemessen.
  - Erst wenn beide stehen, gehört der Pokal in die Brücke.
- **Europapokal:** ausgeschlossen. Die Gegner-Ratings fehlen, weil das Archiv
  nur die 36 deutschen Klubs hält.
- **[Entscheidung, nicht Teil dieses Briefs]** Ob das Archiv künftig die volle
  Tages-CSV aufbewahren soll, damit ein nächster Ausfall auch Europa
  überbrücken kann. Das berührt Archivgröße und Lizenzumfang
  (`docs/verification/clubelo.md`) und braucht einen eigenen Beschluss.

## 7 · App

- **Statuszeile (Brief 34):**
  - Sie bleibt orange.
  - Sie sagt neu, dass die Ratings **seit dem Ankerdatum (ausgeschrieben, z. B. „31.08.2026") aus Ligaergebnissen
    fortgeschrieben** sind und dass Ergebnisse und Tabelle aktuell sind.
  - Das Datum wird immer ausgeschrieben.
  - Sie macht weiter eine Aussage über die Daten, nie über den Workflow.
- **„Wie gerechnet?":** Methodik Schritt 1 bekommt einen Absatz zur Brücke,
  hinter der geteilten `Disclosure`. Er sagt: Schätzung von clubelos Regel; nur
  Ligaspiele; gemessener Fehler im rückwirkenden Test; Pokal und Europa fehlen.
  Der Wortlaut wird per Test verankert.
- **Kennzeichnung der Gruppe:** Modellgüte nennt `bridged` als eigene Gruppe.
  Die Gruppe trägt eine `note` wie jede gemischte Zahl.
- **Im Archiv** rendert davon nichts.

## 8 · Tests und Grenzfälle

- Die Brücke reproduziert die Studie: gleicher Anker und gleiche Ergebnisse
  liefern bitgleiche Werte; die Studie und der Pipeline-Code rechnen mit
  **einer** Implementierung der Regel.
- Determinismus: Die Reihenfolge der Eingabe-Fixtures ändert den Wert nicht,
  eine Permutation gleich angestoßener Spiele auch nicht.
- Kein Archiv-Schreiben auf dem Brückenpfad. Der Wächter prüft das über die
  Aufrufzahl, wie in `entkopplung.test.mjs`, nicht über einen werfenden Stub.
- Ohne Schalter ist alles bitgleich dem heutigen Stand. Mit Schalter und
  null Spielen seit dem Anker ist alles bitgleich ohne Schalter.
- Rückkehr: Ein neuer Snapshot macht offene `bridged`-Einträge zu
  `contemporaneous`; eingefrorene bleiben, wie sie sind.
- **`grenzfaelle.md`** bekommt die neuen Grenzen mit Randtests:
  - der Anker-Tag selbst: ein Spiel am Ankerdatum, vor oder nach dem
    Snapshot;
  - das Ablaufdatum des Schalters: darunter, genau darauf, darüber;
  - das Saisonende als harte Grenze;
  - ein Nachholspiel, das nach dem Anker gespielt wird, aber zu einem Spieltag
    davor gehört. Es wird verbucht, denn maßgeblich ist der Anstoß, nicht der
    Spieltag.
- Tests auf die laufende Saison prüfen nur Strukturelles. Ob die Brücke
  gerade läuft, ist ein vergänglicher Zustand und gehört an konstruierte
  Eingaben (`seasonStates.mjs`).

## 9 · Release

2.6.0 (Feature, neue Provenienz im Artefaktschema). Tag + Release im selben
Gang, Lockfile-Gleichlauf im selben Commit. Die Release Notes nennen die
Brücke als **Schätzung** mit dem gemessenen Fehler.
