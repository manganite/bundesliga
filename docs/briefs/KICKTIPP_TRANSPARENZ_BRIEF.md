# Brief — App B: Rechenweg-Transparenz, Markt/Modell, Spieltag-1-Quotenfix

**Drei Teile. §1 wartet auf die Spieltag-1-Fixture von [USER] (Gate G1) —
§2/§3 sind davon unabhängig und können sofort. Keine Änderung an
Optimierung oder Scoring: §2/§3 zeigen ausschließlich Größen, die die App
heute schon berechnet oder die sich aus vorhandenen Funktionen ergeben
(impliedProbabilities, bestTipWithinTendency, die Bonuszerlegung in
expectedPoints).**

## G1 · Gate: Spieltag-1-Fixture

[USER] liefert das Tabellen-outerHTML der Tippabgabe des 1. Spieltags als
Datei; committen als `apps/kicktipp/tests/fixtures/tippabgabe-2026-md1.html`
(Anonymisierungs-Blick wie gehabt). Erst dann §1.

## 1 · Quoten-Extraktion Spieltag 1 [nach G1]

- Ursache aus der Fixture diagnostizieren (nicht raten) und die
  Extraktion **strukturell tolerant** machen: der Quotenblock wird über
  seine semantischen Klassen gefunden, unabhängig davon, in welchem
  Stack-Element er steckt und ob Anbieter-Markup ihn umschließt.
  Beide Fixtures (md1 + md2) müssen mit derselben Extraktion vollständig
  parsen — das ist der Test.
- **Fehlersichtbarkeit je Zeile:** Fehlen die Quoten eines Spiels oder
  sind sie unlesbar, sagt das Panel es an dieser Zeile mit Grund
  („Wettquoten nicht gefunden — dieses Spiel läuft im Nur-Modell-Modus"),
  und die Vorschlagstabelle zeigt bei diesem Spiel „Grundlage: Modell".
  Gemischte Spieltage sind damit erster Klasse, kein Sonderfall.

## 2 · Rechenweg je Spiel — der „Wie gerechnet?"-Gedanke aus App A

Jede Zeile der Vorschlagstabelle bekommt einen Aufklapper (ein
Disclosure-Muster wie App A, eine Implementierung):

1. **Markt in Prozent:** „Quoten 3,94 / 9,21 / 1,57 → entrandet
   25,4 % / 10,9 % / 63,7 % (Marge 0,2 %)" — die Umrechnung, die du dir
   gewünscht hast, mit sichtbarer Marge.
2. **Modell in Prozent** daneben (aus der reinen Modellmatrix desselben
   Spiels): „Modell: 31 % / 24 % / 45 %" — damit ist der
   Markt/Modell-Vergleich je Spiel direkt ablesbar; deutliche
   Abweichungen (Schwelle: ≥ 10 Pp. in einer Tendenz) werden dezent
   markiert.
3. **Je Tendenz der beste Tipp mit zerlegtem Erwartungswert:**
   „H · 2:1 · 2,88 = 2,41 (Tendenz) + 0,27 (Differenz) + 0,20 (exakt)" —
   die drei Stufen aus expectedPoints, einzeln ausgewiesen; der Sieger
   markiert, die Marge zum Zweitplatzierten genannt.
4. **Ein Satz zur Entscheidung:** „Kein Abweichen: H schlägt A um 0,70
   erwartete Punkte." bzw. bei Abweichung der Grund in einer Zeile.
Die Summenzeile unter der Tabelle (erwartete Punkte gesamt, erwartete
Trefferquote) bleibt; der Trefferquoten-Ehrlichkeitssatz bleibt verankert.

## 3 · Grundlage-Umschalter Markt / Modell

- Über der Vorschlagstabelle: **„Grundlage: Markt | Modell"** (Default
  Markt, wenn Quoten vorhanden). Modell-Modus rechnet dieselbe
  Optimierung auf der reinen Modellmatrix — der Pfad existiert als
  Quoten-Fallback bereits; er wird nur wählbar.
- **Ehrliche Caption, verankert:** „Modell-Grundlage dient dem Vergleich
  und quotenlosen Runden. Auf lange Sicht ist zu erwarten, dass
  margenfreie Marktquoten die bessere Einzelspiel-Schätzung sind —
  Abweichungen des Modells sind interessant, nicht automatisch besser."
- Der Umschalter wirkt sichtbar (Grundlage-Spalte je Zeile), und die
  Panel-/Rechenweg-Anzeigen folgen der gewählten Grundlage konsistent.

## 4 · Tests

- [nach G1] Beide Fixtures parsen vollständig mit einer Extraktion;
  konstruierte Zeile ohne Quotenblock → Zeilen-Hinweis + Grundlage
  Modell (gemischter Spieltag getestet).
- Rechenweg: Prozentumrechnung gegen impliedProbabilities; Zerlegung
  summiert exakt auf den Gesamterwartungswert (Identitätstest gegen
  expectedPoints); Abweichungs-Markierung an konstruiertem ≥10-Pp.-Fall.
- Umschalter: Modell-Modus reproduziert auf einer quotenlosen Fixture
  den bisherigen Fallback bitgleich; Caption verankert.
- Sicherheits- und Bestandstests unverändert; Ein-Datei-Nachweis grün.

## 5 · Abnahme

§2/§3 sofort; §1 nach G1. Danach [USER]-Gegenprobe am 1. Spieltag:
Panel zeigt 9 Spiele MIT Quoten (oder benennt je Zeile, warum nicht),
Rechenweg-Aufklapper zeigt Prozente, Zerlegung und Entscheidungssatz.
CLAUDE.md-Kette und Zustand nach stehender Regel. Kein Release-Bump
(App B wird nicht deployt).
