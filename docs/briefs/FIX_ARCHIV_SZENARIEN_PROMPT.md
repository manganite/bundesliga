# Prompt — Fix: Szenarien auf Archiv-Saisons (vor dem 2.3.0-Release)

**Ein kleiner PR. Wurzel: der `remaining.length === 0`-Frühausstieg in
`Szenarien.jsx` ist eine Brief-16-Altlast — er stammt aus der Zeit, als die
Seite nur offene Spiele kannte, und riegelt seit dem Freigeben-Primitiv
einen voll funktionsfähigen Pfad ab. Die Archiv-Verkabelung dahinter
(Saisonende-Ratings-Klausel) existiert bereits.**

## 1 · Wächter entfernen, nicht verfeinern

- Der Frühausstieg entfällt ersatzlos. Eine vollständig gespielte Saison
  rendert die normale Spieltagsliste: alle Spiele im Zustand **real**, mit
  Freigeben/Festsetzen; Presets funktionieren (Bereiche „alle gespielten
  Spiele", Spieltag, Verein, Duelle).
- Einziger verbleibender Leerzustand: `season.fixtures.length === 0`
  (Saison ohne Daten), mit entsprechend umformuliertem Text („Für diese
  Saison liegen keine Spieldaten vor.").
- Spieltags-Vorwahl: „nächster offener Spieltag, sonst der **letzte**" —
  bei Archiv-Saisons landet man damit am 34. Spieltag, wo die
  Entscheidungen fielen.

## 2 · Deterministische Basis — verifizieren, nicht bauen

Bei einer voll gespielten Saison ist die unveränderte Basis-Simulation
deterministisch (alle Wahrscheinlichkeiten 0/1). Verifizieren, dass der
Delta-Pfad das sauber verdaut: der reportDelta-0/0-Fix aus V2a greift, die
Tabs zeigen nach einem Freigeben echte Bewegung (z. B. Meister von 100 %
auf x %). Kein Umbau erwartet — nur der Test, der es festhält.

## 3 · Der Test, der gefehlt hat — durch die Seite, nicht darunter

Der bestehende 2014er-Abnahmetest prüft die Mechanik unterhalb des
Wächters und blieb deshalb grün, während die Seite abriegelte. Neu, als
Lehre daraus: ein Rendertest **auf Seitenebene** — Archiv-Saison laden,
die Spieltagsliste MUSS erscheinen (der alte Leerzustandstext darf bei
vorhandenen Fixtures nie rendern), ein gespieltes Spiel freigeben,
rechnen, Schlusstabelle und Tabs zeigen das Ergebnis. Zusätzlich derselbe
Weg über ein Preset („Spieltag 34 · Nur Überraschungen · Anwenden &
rechnen").

## 4 · Abnahme

- Kein `remaining.length`-Frühausstieg mehr; Datenlos-Leerzustand
  getestet; Vorwahl-Regel getestet (offen → nächster, Archiv → letzter).
- Seitenebenen-Test aus §3 grün; deterministische-Basis-Test aus §2 grün.
- Explainer-Archivklausel („Ratings vom Saisonende") rendert jetzt
  erreichbar und bleibt verankert.
- Danach: Release **2.3.0** (Tag + Release, deutsche Notes über V2b.1
  inkl. dieses Fixes) nach stehender Regel — sofern [USER] nach Punkt 2
  des laufenden Reviews nichts weiter vorzieht; sonst wartet der Bump wie
  bei 2.2.0 auf das Review-Ende.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
