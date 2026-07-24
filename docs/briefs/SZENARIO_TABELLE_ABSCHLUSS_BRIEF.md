# Prompt — Abschluss Brief 17: Pfeilspalte + Release v2.2.0

Ein Arbeitsgang, zwei Commits: (1) die letzte Präsentationsänderung, (2) Versions-Bump
mit Tag und Release nach stehender Regel. Keine Engine-, Pipeline- oder Datenänderung.
Die „Wie gerechnet?"-Texte sind geprüft und bleiben unangetastet — nur der eine
Verankerungssatz unten ändert sich.

## 1 · Pfeilspalte wandert an den rechten Tabellenrand

Der Positions-Indikator der Szenario-Schlusstabelle steht neben der #-Spalte und wird
dort zwangsläufig als „#-Veränderung" gelesen — er misst aber die Verschiebung in der
Erwartungs-Reihenfolge (erw. Pkt), also die Daten der rechten Spalten. Die Position ist
die Aussage:

- Die Indikatorspalte zieht ans rechte Ende der Tabelle (nach dem 10–90-%-Band),
  Spaltenkopf „Δ Platz".
- Der `title` bleibt wie er ist (Platzzahl + Δ erw. Pkt).
- Der Verankerungssatz im „Wie gerechnet?"-Teil der Schlusstabelle wird durch die
  einfachere Form ersetzt (die räumliche Kontrastierung ist durch die neue Position
  überflüssig): „Der Pfeil misst die Verschiebung in der Reihenfolge nach erwarteten
  Punkten gegenüber der unveränderten Prognose — gleiche Zufallszahlen."
  Verankerungstest entsprechend anpassen (alter Satz raus, neuer rein).
- Rendertest: „Δ Platz" ist die letzte Spalte; der Vorsaison-Zustand ohne Indikator
  bleibt getestet.

## 2 · Version 2.2.0 — Bump, Tag, Release

Nach stehender Regel im selben Arbeitsgang:

- `apps/public/package.json` → 2.2.0; Footer zeigt und verlinkt die neue Version
  (bestehender Mechanismus, nur verifizieren).
- Tag `v2.2.0` auf den Stand nach §1, GitHub-Release mit deutschen Notes über
  Brief 16 + 17, sinngemäß in 4–6 Zeilen. Wortlaut darf redaktionell geglättet werden;
  die letzte Zeile (benannte Approximation) bleibt inhaltlich erhalten.
- Release-Badge im README zeigt danach v2.2.0 (nur verifizieren, kein Eingriff).

## 3 · Abnahme

- „Δ Platz" als letzte Spalte, neuer Verankerungssatz aktiv, alter entfernt; 625+ Tests
  grün, keiner übersprungen.
- Version 2.2.0 live im Footer und verlinkt; Tag und Release existieren; Badge zeigt
  v2.2.0.
- CLAUDE.md: Vorgabekette um diesen Abschluss ergänzt, „Aktueller Zustand" im selben
  Commit; Versionsregel-Eintrag bestätigt sich selbst (Bump = Tag + Release in einem
  Gang).
