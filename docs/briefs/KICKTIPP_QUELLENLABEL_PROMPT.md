# Prompt — App B: Quellen-Label, „entrandet" raus, Modell-Zeilen-Wächter

**Drei kleine Teile, ein PR. Keine Optimierungs-/Scoring-Änderung.**

## 1 · „entrandet" → Nutzersprache [Jargon-Regel]

Die Rechenweg-Zeile formuliert um:
> Markt: Quoten 1,32 / 6,50 / 7,25 → ohne Marge 72,2 % / 14,7 % / 13,1 %
> (Marge 4,9 %).
Im „Wie gerechnet?"-Teil ein Erklärsatz: „Kehrwerte der Quoten summieren
auf 104,9 % — der Überschuss ist die Marge (Gewinnaufschlag des
Anbieters); geteilt durch die Summe ergeben sich die Prozente." Das Wort
„entrandet" verschwindet aus allen Nutzertexten (Quellscan über die
UI-Strings; in Code-Kommentaren ist es egal).

## 2 · Quotenquelle benennen (Marge-Heuristik)

Verifizierter Befund: Kicktipp zeigt zwei Quotensorten — echte
Buchmacherquoten (Oddset-Links, Marge ~5 %) nahe am Spieltag und
margenfreie rechnerische Quoten (mutmaßlich aus dem Tippverhalten,
stark geherdet: bis 37 Pp. extremer als das Modell) für fernere
Spieltage. Die App sagt, was sie sieht:
- Marge ≥ 2 %: „Buchmacherquoten (Marge X %)".
- Marge < 2 %: „rechnerische Quoten ohne Marge — vermutlich aus dem
  Tippverhalten der Runde, nicht von einem Buchmacher".
Formulierung bewusst mit „vermutlich" — die Herkunft ist plausibel
erschlossen, nicht dokumentiert. Anzeige in der Prüf-Tabelle
(Grundlage-Spalte oder Tooltip) und im Rechenweg. Schwelle als benannte
Konstante mit Kommentar.

## 3 · Wächter: Die Modell-Zeile zeigt das Modell

Die umgewichtete Matrix hat per Konstruktion Marktränder — würde sie
versehentlich die „Modell"-Zeile speisen, stünde der Markt zweimal da
und der Vergleich wäre wertlos. Struktureller Test (Interaktions-/
DOM-Ebene, gegen das gebaute Bundle wie die bestehenden App-B-Tests):
konstruiertes Spiel mit großer Modell/Markt-Divergenz (z. B. Elo-Abstand
+ konträre Odds) → die gerenderte Modell-Zeile MUSS die Werte des
`odds: null`-Laufs zeigen (numerischer Abgleich), NICHT die
Marktprozente; die Abweichungs-Markierung feuert. Referenz aus echten
Daten für die menschliche Gegenprobe: Augsburg – Schalke (1. Spieltag)
= Markt 44,0/25,5/30,5 vs. Modell 56,6/23,9/19,5.

## 4 · Abnahme

Umformulierung sichtbar, Erklärsatz da, Jargon-Scan grün; Quellen-Label
in beiden Varianten (beide Fixtures decken je eine ab); Wächter-Test
grün und schlägt bei konstruierter Fehlverdrahtung an (Selbsttest).
[USER]-Gegenprobe: Rechenweg Augsburg – Schalke zeigt die
Referenzwerte. Kein Release-Bump; CLAUDE.md-Kette und Zustand nach
stehender Regel.
