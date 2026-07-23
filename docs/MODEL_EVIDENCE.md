# Was am Modell belegt ist — und was nicht

Diese Seite fasst zusammen, worauf das ausgelieferte Modell beruht. Die
Untersuchungen selbst liegen in einem privaten Forschungsrepo; die
Produktions-Fitprozedur liegt in diesem Repo unter
[`packages/fit`](../packages/fit) und ist damit nachvollziehbar.

Ein Hinweis vorweg, der für alles hier gilt: **ein Nullbefund ist kein
Nichtvorhandensein.** Wo unten steht „kein messbarer Vorteil", heißt das, dass
sich unter dieser Modellform, diesem Datenfenster und dieser Datenmenge nichts
nachweisen ließ — nicht, dass es den Effekt nicht gibt.

## Das Modell

Tore je Mannschaft als Poisson-Verteilung mit einer Dixon-Coles-Korrektur für
niedrige Ergebnisse. Die Torerwartung folgt aus der Elo-Differenz und einem
festen Heimvorteil. Gefittet wird auf **15 Saisons** beider Ligen, gleich
gewichtet.

## Der eine positive Befund: Live-Ratings statt Vorsaison-Ratings

Ratings, die sich während der Saison mitbewegen, sagen die Ergebnisse besser
vorher als eingefrorene Saisonstart-Ratings.

- Verbesserung im Log-Loss: **0,0127**
- 95-%-Intervall, nach Saisons geclustert: **[0,0039; 0,0228]**
- In **9 von 10** zurückgehaltenen Saisons positiv

Das saisongeclusterte Intervall ist die belastbare Angabe. Die deutlich engeren
Intervalle je Einzelspiel werden hier bewusst nicht zitiert — sie unterstellen
Unabhängigkeit zwischen Spielen derselben Saison, die es nicht gibt.

## Geprüft und **nicht** gebaut

Für keine dieser Erweiterungen ließ sich unter der geprüften Modellform, dem
15-Saison-Fenster und der verfügbaren Datenmenge ein messbarer Vorteil zeigen.
Sie sind deshalb nicht im Modell — was nicht heißt, dass sie wirkungslos wären.

| Mechanismus | Befund |
|---|---|
| Überdispersion (negativ-binomial statt Poisson) | kein messbarer Vorteil |
| Ordered-Outcome-Hybrid | kein messbarer Vorteil |
| Heimvorteil je Klub statt eines gemeinsamen | in diesen Daten nicht von Zufallsstreuung unterscheidbar |
| Paarweiser „Angstgegner"-Term | in diesen Daten nicht von Zufallsstreuung unterscheidbar |
| Nachfitten der Parameter während der Saison | kein messbarer Vorteil |
| Recency-Gewichtung (jüngere Saisons stärker) | kein messbarer Vorteil |

Zum Heimvorteil je Klub und zum Angstgegner-Term im Einzelnen: die beobachtete
Streuung zwischen Klubs beziehungsweise Paarungen wurde gegen eine simulierte
Nullverteilung gehalten. Sie lag innerhalb dessen, was reiner Zufall erzeugt.
Genau deshalb rechnet die App mit einem **gemeinsamen** Heimvorteil.

## Warum das Fenster 15 Saisons ist

Die Recency-Prüfung verglich gleiche Gewichtung gegen eine Reihe von
Halbwertszeiten. Gleiche Gewichtung war nicht schlechter — und weil sie keine
zusätzliche Annahme braucht, wird sie ausgeliefert.

Dieser Befund wurde **auf 15 Saisons** festgestellt. Das ist keine Nebensache:
ändert sich die Fensterregel, gilt die Aussage nicht mehr automatisch, und die
Prüfung muss vorher erneut laufen. Deshalb ist eine Änderung der Fensterregel im
Refit-Verfahren ausdrücklich eine Prozess-B-Änderung
([§5.5](../docs/DEVELOPMENT.md)).

## Ligaunterschiede

Die 2. Bundesliga bekommt eigene additive Abweichungen für Torrate, Elo-Maßstab
und Heimvorteil. Anders als die Punkte oben haben sich diese drei auf
zurückgehaltenen Daten bewährt und sind deshalb Teil des ausgelieferten
Parametersatzes. Die Werte stehen in
[`data/season-params.json`](../data/season-params.json).

## Geisterspiele

Für die Spiele ohne Publikum wurde eine Abweichung des Heimvorteils mitgefittet.
Der gepoolte Schätzwert liegt bei −24 Elo-Punkten, das 95-%-Intervall bei
**[−51; +11]** — es schließt die Null ein.

Daraus folgt **keine** Aussage darüber, ob Publikum den Heimvorteil verursacht.
Die Saisons ohne Zuschauer waren nicht randomisiert, sie fielen mit vielen
anderen Änderungen zusammen, und jedes relevante Intervall enthält die Null. Der
Term wird mitgeführt, damit historische Nachrechnungen dieselbe Modellform
benutzen — mehr behauptet er nicht.

## Wie diese Zahlen aktuell bleiben

Einmal im Jahr wird der Amtsinhaber auf der neu abgeschlossenen Saison
ausgewertet — ein echtes Out-of-Sample-Ergebnis, weil er sie nie gesehen hat —
und anschließend auf den neuesten 15 abgeschlossenen Saisons neu gefittet. Das
läuft als Pull Request mit Bericht, nie als stiller Commit. Eine methodische
Änderung durchläuft zusätzlich einen Rolling-Origin-Vergleich mit vorab
festgelegten Schranken. Beides steht in
[docs/DEVELOPMENT.md](DEVELOPMENT.md).
