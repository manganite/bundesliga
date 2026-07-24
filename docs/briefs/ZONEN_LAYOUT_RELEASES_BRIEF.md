# Brief — Zonen-Karte, Kartenlayout, „Wie gerechnet?" als Regel, Releases & Badges

**Presentation + Repo-Hygiene. Keine Engine-, Pipeline- oder Datenänderung.
Punkt §3 revidiert eine Konstante aus Brief 13; §4 ergänzt die
Versionsregel aus Brief 13 um Tag/Release.**

## 1 · Platzierungszonen: Anzahl = Zonengröße, mindestens drei

Revidiert Brief 13 §2.1 („Top 3"): Eine Vier-Plätze-Zone mit drei Einträgen
provoziert die Frage „wer kommt auf Platz 4?". Neu: **je Zone
`max(Zonenplätze, 3)` Kandidaten** — Platz 1–4 zeigt vier, Platz 5–6 und
Relegationsplatz drei. Aus der Zielkonfiguration abgeleitet, nicht hart
codiert (BL2 folgt automatisch). Caption unverändert; die Einträge bleiben
Kandidaten, keine Besetzung.

## 2 · Kartenlayout der Übersicht: Spalten statt Reihen

Das Reihen-Grid erzeugt Lücken, weil die Zeilenhöhe der höchsten Karte
folgt. Umstellung auf **Spaltenlayout** (CSS Multi-Column mit
`break-inside: avoid` oder gleichwertig): Karten stapeln je Spalte
lückenlos. Reihenfolge definiert, damit die Leseordnung gewollt bleibt:
Spalte 1 Titelrennen → Wichtigstes Spiel, Spalte 2 Abstiegskampf →
Spannungsindex, Spalte 3 Platzierungszonen. Mobile (eine Spalte) behält die
bisherige Reihenfolge. Responsive-Breakpoints wie gehabt.

## 3 · „Wie gerechnet?" wird Regel, nicht Einzelfall

- **Eine geteilte Disclosure-Komponente** (die aus dem Wichtigsten Spiel
  wird extrahiert, nicht kopiert — Nachweis wie bei `FixturePrediction`).
- **Regel:** Jede Karten-Caption mit mehr als zwei Sätzen teilt sich in
  1–2 sichtbare Sätze (die Antwort in Nutzersprache) und den Methodikteil
  im Toggle. Als stehende Regel in CLAUDE.md, damit künftige Karten sie von
  Geburt an befolgen.
- **Jetzt umstellen:** Spannungsindex, Kalibrierung, Frozen/Live-Vergleich,
  Restprogramm-Schwere, Direkte Duelle, Rating-Aktualität. Je Karte
  formuliert CC die sichtbare Kurzfassung selbst — Maßstab: beantwortet die
  Nutzerfrage, behauptet nichts, was der Toggle dann einschränken müsste.
- **Schutzmechanik:** Alle per Test verankerten Wortlaute (§4/§8-Sätze,
  Normalisierungs-Hinweise, Stichprobenangaben) bleiben vollständig
  erhalten — die Verankerungstests werden auf beide Teile erweitert, wie
  beim Wichtigsten Spiel vorgemacht. Kein Ehrlichkeitsinhalt entfällt;
  er wechselt höchstens hinter den Toggle.

## 4 · Version wird Release, Release wird Link

- **Git-Tag `v2.1.0`** auf den aktuellen Stand plus **GitHub-Release** mit
  kurzen deutschen Notes (aus den Briefen 13/14 zusammengefasst).
- **Stehende Regel** (ergänzt die Versionsregel aus Brief 13 in CLAUDE.md):
  jeder Versions-Bump = Tag + Release im selben Arbeitsgang; die Notes
  fassen den zugehörigen Brief in 3–5 Zeilen zusammen. Ältere Stände werden
  **nicht** rückwirkend getaggt — die Historie beginnt ehrlich bei 2.1.0.
- **Footer:** die Versionsnummer verlinkt auf
  `…/releases/tag/v{version}`; der Build-Stempel bleibt unverlinkt daneben.

## 5 · Badge-Leiste im README

Direkt unter dem Titel, nach Birss-Vorbild, vier Badges:
**CI** (test.yml-Status), **Deploy** (Pages-Workflow-Status), **Release**
(neuestes GitHub-Release, zeigt v2.1.0), **License** (GPL-3.0). Die
Standard-GitHub-Badge-URLs, kein Drittdienst nötig; Badges sind
sprachneutral und brechen das deutsche README nicht.

## 6 · Abnahme

- Zonen-Karte: 4/3/3 Einträge aus der Zielkonfiguration (Rendertest beide
  Ligen); Caption unverändert.
- Übersicht ohne Reihen-Lücken (Spaltenlayout), definierte Reihenfolge,
  Mobile unverändert.
- Eine Disclosure-Komponente, sechs Karten umgestellt, sichtbare Teile
  ≤ 2 Sätze, Verankerungstests über beide Teile erweitert; Regel in
  CLAUDE.md.
- Tag + Release v2.1.0 existieren; Footer-Version verlinkt; Regel in
  CLAUDE.md; README-Badges rendern (Release-Badge zeigt die Version).
- CLAUDE.md-Kette und Zustand nach stehender Regel; läuft als Brief 15.
