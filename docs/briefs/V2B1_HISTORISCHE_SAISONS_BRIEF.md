# Brief — V2b.1: Historische Saisons 2011/12–2025/26

**Datengrundlage: ausschließlich die committeten Fit-Trainingsdaten plus
EIN einmaliger OpenLigaDB-Abruf (§G1). Null clubelo-Anfragen — der
V2b-Trigger (Relaunch → Nachverifikation → eigener Brief) bleibt unberührt
und gilt weiter für die Erweiterung vor 2011 (V2b.2). Die Saison wird eine
zweite globale Dimension neben der Liga; es entsteht keine neue Seite und
keine zweite Implementierung von irgendetwas.**

## G · Drei Gates vor dem Bau

**G1 — Relegations-Endergebnisse.** Die Trainingsdaten enthalten nur
Ligaspiele. Einmaliger OpenLigaDB-Abruf der Relegations-Play-offs
2011/12–2025/26 (beide Paarungen je Saison), committet mit `source`-Feld
unter ODbL wie alle Ergebnisdaten. Falls OpenLigaDB einzelne Jahre nicht
führt: kuratierte Konfigurationsdatei mit Quellenangabe je Eintrag —
fail-closed, kein stilles Raten. Gebraucht für die Saisonbilanz
(„Klassenerhalt über die Relegation").

**G2 — Tiebreak-Konstanz im Fenster.** Das offene §11-V2-Gate, auf 15
Jahre geschrumpft: einmalig gegen die Spielordnungs-Historie prüfen, ob
die Kriterienkette seit 2011/12 unverändert ist. Unverändert → Befund mit
Quelle in `docs/verification/dfl-spielordnung.md` (append). Verändert →
Kette wird Saisonkonfiguration wie die Auswärtstorregel. Vermutet wird
nichts.

**G3 — Klub-Register vollständig.** Alle Klubs, die im Fenster in BL1/BL2
auftauchen (Auf- und Absteiger aus der 3. Liga eingeschlossen), brauchen
Registereinträge: Anzeigename, Kurzname, clubId-Zuordnung zu den
Trainingsdaten. Fail-closed: eine unbekannte clubId in den historischen
Daten bricht die Artefakt-Generierung mit Namensnennung ab (bestehendes
§5.2-Muster).

## 1 · Historien-Artefakte — einmalig generiert, committet

Neuer Pipeline-Batchbefehl (`--historical <saison>` o. ä.), je Saison und
Liga:
- **Timeline** (34 Punkte à 5 000 Läufe, konsistent zum Verlauf) und
  **Outlook-Endzustand**, aus den rekonstruierten Ratings: der Stand „nach
  Spieltag N" ist der Pre-Match-Wert vor dem jeweils nächsten Spiel des
  Klubs — exakt, nicht genähert (Treppenfunktion; die Rekonstruktion ist
  eine getestete Pipeline-Funktion).
- Pre-Match-Prognosen je Spieltag für Spieltage-Archiv und Modellgüte
  (die Pre-Match-Elo-Werte liegen vor; Provenienz der Einträge:
  `backfilled` — sie sind rückwirkend zusammengesetzt, und die
  §5.3-Regeln für diese Provenienz gelten).
- Artefakte protokollgestempelt, deterministisch (Regeneration =
  bitgleich, Test an einer Saison), einmal committet, nie im Cron.
- Aufwand ~1 h Batch; der Befehl ist wiederaufsetzbar (pro Saison
  idempotent), damit ein Abbruch nicht von vorn beginnt.

## 2 · Saisonwähler und Archiv-Regeln

- **Saisonwähler im Header** neben dem Liga-Toggle; Default ist immer die
  laufende Saison; Auswahl ist Session-Zustand wie die Liga.
- Gewählte historische Saison trägt überall die **Archiv-Markierung**
  („2023/24 · Archiv" am Wähler, Banner-Zustand „Saison beendet").
- **Live-Elemente rendern in Archiv-Saisons nie:** Carry-forward-Warnung,
  Datenstand-Warnungen, „Saison beginnt in Kürze", die spielplanbezogene
  Ergebnis-aussteht-Warnung. Ein Rendertest zählt sie auf und hält sie
  fern.

## 3 · Seitenverhalten

- **Verlauf** — das Herz des Replays: die volle Timeline, unverändert in
  der Mechanik. Label gemäß §11 an jeder historischen Timeline:
  „Retrospektive Modellrechnung mit den heutigen Parametern
  (Parameterversion sichtbar) — nicht die damalige Vorhersage."
- **Übersicht** wird für Archiv-Saisons zur **Saisonbilanz**: Meister,
  Auf-/Absteiger, Relegationsausgang (G1), die größte Überraschung der
  Saison (Surprisal-Maximum) und der unwahrscheinlichste Moment der
  Timeline (der spätere Meister bei seinem Wahrscheinlichkeits-Minimum —
  „Leverkusen 2023/24 stand bei X %"). Hier lebt der
  Überraschungsmeister-Inhalt, je Saison.
- **Tabelle & Prognose** zeigt die Abschlusstabelle über die geteilte
  `LeagueTable`; die Heatmap ist im Endzustand degeneriert und verbirgt
  sich (bestehende §7-Regel).
- **Spieltage** wird Archiv: Ergebnis neben Pre-Match-Prognose je Spiel;
  Duell-Markierung aus den historischen Artefakten funktioniert mit.
- **Teams**: Rating-Verlauf aus der Rekonstruktion, Saisonbilanz des
  Klubs.
- **Modellgüte** funktioniert unverändert — mit der Pflicht-Caption aus
  §4 dieses Briefs.
- **Szenarien bleibt voll erhalten** (Erbmasse aus Brief 16/17):
  Freigeben, Presets, Schlusstabelle — auf einer beendeten Saison ist das
  Kontrafaktual die reinste Form des Werkzeugs. **Rating-Festlegung,
  ausgesprochen:** die Szenario-Simulation nutzt die letzten
  rekonstruierten Ratings der Saison; die bestehende „Ratings spulen
  nicht zurück"-Caption wird um den Archiv-Halbsatz ergänzt („hier: die
  Ratings vom Saisonende").
- **Methodik** ist saisonunabhängig und bleibt.

## 4 · Ehrlichkeit — zwei verankerte Sätze

1. **In-sample-Pflicht** überall, wo historische Modellgüte oder
   Treffsicherheit gezeigt wird: „2011/12–2025/26 ist das
   Trainingsfenster der heutigen Parameter — Rückblicke in diesem Fenster
   sind keine unabhängige Prüfung des Modells." Verankerungstest.
2. Das **Retrospektiv-Label** aus §3/Verlauf, ebenfalls verankert.

## 5 · [USER] — Annotationen

Welche Saisons Anmerkungen verdienen und was darin steht, ist Inhalt,
nicht Code. Struktur wird gebaut (je Saison optionaler Annotationstext in
der Konfiguration, Anzeige in der Saisonbilanz mit Zeitfenster-Angabe);
die Texte lieferst du nach Belieben, auch nach Release — leere
Annotationen rendern nichts (§7).

## 6 · Abnahme

- G1–G3 erledigt und dokumentiert, bevor Artefakte generiert werden; der
  G1-Abruf ist der einzige Netzabruf des gesamten Briefs (Log-Nachweis).
- Rekonstruktionsfunktion getestet (inkl. eines konstruierten Falls mit
  Spielausfall/Nachholspiel — der Pre-Match-Wert vor dem *nächsten*
  Spiel gilt, nicht der Kalender); Artefakt-Determinismus an einer
  Saison nachgewiesen.
- Saisonwähler mit Default laufende Saison; Archiv-Markierung überall;
  Live-Elemente-Ausschluss per Test; alle acht Seiten verhalten sich wie
  §3 (Rendertests je Variante, inkl. Szenario auf historischer Saison:
  ein gespieltes 2014er-Spiel freigeben und rechnen).
- Beide Ehrlichkeitssätze verankert; Retrospektiv-Label an jeder
  historischen Timeline; Provenienz `backfilled` an allen historischen
  Pre-Match-Einträgen.
- Null clubelo-Anfragen (Log); V2b-Trigger-Text in CLAUDE.md unverändert,
  ergänzt um den Vermerk „V2b.1 (2011+) ausgeliefert, V2b.2 (vor 2011)
  weiter hinter dem Trigger".
- Danach Version **2.3.0**, Tag + Release nach stehender Regel;
  CLAUDE.md-Kette und Zustand; läuft als Brief 19.
