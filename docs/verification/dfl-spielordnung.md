# Gate 4 + 5 — DFL-Spielordnung als Primärquelle

**Quelle:** DFL Spielordnung (SpOL), Stand 06.03.2026, § 5 Nr. 3.
<https://media.dfl.de/sites/2/2026/03/Spielordnung-SpOL-2026-03-06-Stand.pdf>
Abgerufen und im Volltext ausgewertet am 2026-07-23.

§11 verlangte diese Prüfung ausdrücklich, weil das Lab die Reihenfolge von einer
Drittseite bezogen hatte („playoffstatus.com", siehe `src/league.mjs` im
football-model-lab). Die Prüfung hat einen echten Fehler gefunden.

## 4.1 Tiebreak-Reihenfolge — wörtlich

> **c)**
> Bei Punktgleichheit in der Bundesliga und der 2. Bundesliga werden
> nachstehende Kriterien in der aufgeführten Reihenfolge zur Ermittlung
> der Platzierung herangezogen:
>
> 1) die nach dem Subtraktionsverfahren ermittelte Tordifferenz
> 2) Anzahl der erzielten Tore
> 3) das Gesamtergebnis aus Hin- und Rückspiel im direkten Vergleich
> 4) die Anzahl der auswärts erzielten Tore im direkten Vergleich
> 5) die Anzahl aller auswärts erzielten Tore.
> 6) Ist auch die Anzahl aller auswärts erzielten Tore gleich, findet ein
>    Entscheidungsspiel auf neutralem Platz statt.

## 4.2 In-Saison-Regeln — wörtlich, im Brief vollständig fehlend

> Wurden während einer laufenden Spielzeit Hin- und Rückspiel noch
> nicht ausgetragen, ist der Tabellenplatz bei Punktgleichheit von zwei
> oder mehr Mannschaften ausschließlich nach den ersten beiden
> Kriterien zu ermitteln. Kann keine eindeutige Platzierung ermittelt
> werden, stehen die entsprechenden Mannschaften auf einem geteilten
> Tabellenplatz.
>
> Wurden während einer laufenden Spielzeit Hin- und Rückspiel bereits
> ausgetragen, so werden während der laufenden Saison auch die
> Kriterien 3) bis 5) herangezogen. Kriterium 6) findet während der
> laufenden Spielzeit keine Anwendung.

## 4.3 Abweichung zum Brief §6

Brief §6 schrieb:

> Punkte → Tordifferenz → Tore → Direkter Vergleich (Punkte, Tordifferenz,
> Auswärtstore) → Auswärtstore → Entscheidungsspiel

Zwei Fehler:

1. **„Punkte im direkten Vergleich" existiert nicht.** Kriterium 3 ist das
   *Gesamtergebnis* aus Hin- und Rückspiel, also die Tordifferenz über beide
   Begegnungen; die Auswärtstore im direkten Vergleich sind das *separate*
   Kriterium 4. Der Lab-Ranker (`h2hTable` in `src/league.mjs`) sortiert
   dagegen nach H2H-Punkten zuerst — direkt aus der Drittquelle übernommen.
2. **Die In-Saison-Regeln fehlten ganz.** Geteilte Tabellenplätze sind ein
   reales Verhalten der Bundesliga-Tabelle in der Hinrunde und betreffen
   Tabellendarstellung, Clinch-Logik und jede Zielzone.

**Entscheidung (2026-07-23):** Die Spielordnung gilt. `packages/engine`
implementiert 4.1 und 4.2; der Lab-Ranker wird *nicht* unverändert portiert.

## 4.4 Auslegung bei drei oder mehr punktgleichen Klubs

Der Wortlaut „Gesamtergebnis aus Hin- und Rückspiel" ist für den Zweierfall
geschrieben. Bei drei oder mehr punktgleichen Klubs wendet die Engine die
Kriterien 3) und 4) auf eine **Mini-Tabelle über ausschließlich die Spiele der
noch gleichstehenden Klubs untereinander** an und rechnet sie nach jeder
Teilauflösung neu. Das ist die übliche Lesart und dieselbe Mechanik, die der
Lab-Ranker bereits verwendet; abweichend ist nur die Kriterienreihenfolge
innerhalb der Mini-Tabelle (Tordifferenz statt Punkte zuerst). Diese Auslegung
ist eine dokumentierte Entscheidung, keine Aussage der Spielordnung.

## 4.5 Nebenbefunde, die den Brief bestätigen

**Heimrecht im Relegations-Rückspiel** (§6 „bereits verifiziert") — wörtlich
bestätigt, § 5 Nr. 4:

> Das Heimrecht im Rückspiel besitzt der Club, der gemäß dem Spielplan der
> abgelaufenen Spielzeit weniger spielfreie Tage vor dem Hinspiel hatte. Bei
> gleicher Anzahl spielfreier Tage entscheidet das Los.

**Auswärtstorregel in der Relegation** — die SpOL legt sie nicht selbst fest,
sondern verweist dynamisch:

> Die Relegationsspiele werden als Hin- und Rückspiel entsprechend den
> Bestimmungen der UEFA-Clubwettbewerbe ausgetragen, die für die Austragung von
> Spielen im K.-O.-System gelten.

Das stützt die im Brief fixierte Grenze (zuletzt angewandt 2020/21, ab 2021/22
nicht mehr) und erklärt zugleich ihren Mechanismus: sie folgt der UEFA-Änderung,
nicht einer eigenen DFL-Entscheidung. Die Saisonkonfiguration trägt die Grenze
weiterhin als zwei explizite Felder, wie in §6 verlangt.

**Verlängerung im Rückspiel** ist vorausgesetzt (§ 8 Nr. 3 regelt die zusätzliche
Auswechselgelegenheit „kommt es im Rückspiel der Relegationsspiele zu einer
Verlängerung"), konsistent mit der ET-Phase aus §6.

## Gate 5 — Änderte sich die Reihenfolge im Fenster ab 1995/96? **Offen**

Auf `media.dfl.de` ist die älteste auffindbare Fassung **Stand 22.08.2019**.
Deren Wortlaut ist mit der Fassung von 2026 in § 5 Nr. 3 c) **zeichengleich** —
Reihenfolge und In-Saison-Regeln sind zwischen 2019 und 2026 unverändert.

Für 1995/96–2018 liegt aus der Primärquelle nichts vor. Das Gate bleibt damit
offen; es ist ein **V2-Gate** und blockiert V1 nicht. Vor V2 muss entweder eine
Primärquelle für die älteren Fassungen beschafft werden, oder die
Tiebreak-Reihenfolge wird — wie §6 es vorsieht — Teil der Saisonkonfiguration,
damit historische Replays nicht blind mit der heutigen Reihenfolge gerechnet
werden. Die Engine ist bereits so gebaut, dass die Reihenfolge aus der
Saisonkonfiguration kommt.
