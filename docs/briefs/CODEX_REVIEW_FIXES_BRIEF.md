# Brief — Codex-Review-Fixes: Zustandsbindung, Interaktionstests, Fail-loud

**Quelle: unabhängiger Codex-Review (2026-07-26, abgelegt als
`docs/reviews/2026-07-26-codex.md` — Ablage ist Teil dieses Briefs). Alle
sechs Befunde sind bestätigt; keiner kollidiert mit einer verbuchten
Entscheidung. Reihenfolge ist Teil der Vorgabe: §1 zuerst, denn §2 und §3
bekommen ihre Regressionstests in dieser Schicht.**

## 1 · Interaktionstest-Schicht (der Enabler)

Die SSR-Harness kann Zustandswechsel, Events und Fokus prinzipiell nicht
sehen — Befunde 2 und 3 des Reviews waren für sie unsichtbar. Neu, klein,
gezielt: eine **jsdom-Schicht mit `react-dom/client` und echten Events**
(dispatchEvent/KeyboardEvent genügen; keine neue Testbibliothek nötig,
falls doch: klein und begründet). Sie ergänzt die SSR-Harness, ersetzt sie
nicht. Startumfang — genau die Fälle, die bisher blind waren:
- Saison-/Ligawechsel (für §2),
- Tab-Tastatursteuerung (für §3),
- ein Szenario-Durchlauf (festsetzen → rechnen → Veraltet-Dimmung),
- ein Disclosure-Toggle.
Kein Anspruch auf Breite — Anspruch auf die richtige Ebene.

## 2 · Hoch: Zustand ist an den Datensatz gebunden — per Remount

- `App.jsx` rendert die Seitenkomponente mit
  **`key={seasonId}-{league}`**: jeder Kontextwechsel verwirft sämtlichen
  Seiten-Lokalzustand (Klubwahl, Spieltag, Verlauf-Ziel, Spiel-Zeugnis —
  und vor allem alle Szenario-Overrides). Verwerfen ist die ehrliche
  Semantik: Ein Szenario aus 2014 hat unter 2026/27 nichts verloren, ein
  BL1-Klub existiert in der BL2-Auswahl nicht.
- Interaktionstest (Schicht aus §1): Szenario in Saison A bauen → Saison
  wechseln → Szenarien-Seite ist jungfräulich; Klubwahl analog über
  Ligawechsel; zurückwechseln stellt NICHT wieder her (kein verstecktes
  Fortleben).

## 3 · Mittel: Tabs vollständig tastaturbedienbar

`Tabs.jsx` nach dem ARIA-Authoring-Muster: Pfeil links/rechts bewegen
Fokus + Auswahl zyklisch, Home/End an die Enden; roving tabindex bleibt.
Gilt automatisch für alle Konsumenten (eine Komponente). Interaktionstest:
mit Pfeiltasten von Tab 1 zu Tab 3 und zurück, Fokus folgt sichtbar.

## 4 · Mittel: Datenladefehler werden laut

`getJsonOrNull` wird aufgeteilt:
- **`getOptionalJson`** — nur HTTP 404 wird `null` (der legitime
  „gibt es nicht"-Fall: fehlende Artefakte, leere Vorsaison-Dateien).
- Alles andere (Netzfehler, 5xx, ungültiges JSON) wirft und erreicht
  einen sichtbaren **Fehlerzustand**: „Daten konnten nicht geladen werden
  — das ist ein Fehler, kein leerer Datenstand. Neu laden hilft
  möglicherweise; sonst bitte später erneut versuchen." (Fehlerdetail in
  der Konsole.) Ein beschädigtes `outlook.json` darf nie wieder als
  „Simulation liegt noch nicht vor" erscheinen — Fail-loud ist
  Projektlinie, die UI war die Ausnahme.
- Tests: 404-Pfad bleibt still; 500/Parse-Fehler rendert den
  Fehlerzustand (SSR-Harness reicht hierfür).

## 5 · Mittel: README-Kausalfehler + Anker wird Scan

- Der RATING_SIGMA-Satz in README Zeile ~48 wird durch die korrekte
  Methodik-Formulierung ersetzt (Streuung = Stärke-Unsicherheit;
  Favoriten verlieren wegen der Torziehung).
- Der bestehende Wortlaut-Anker wird zum **repo-weiten Scan**: das
  falsche Kausalmuster („Favorit … darum/weil … RATING_SIGMA/Streuung")
  ist in App-Quellen UND docs/README verboten. Ein Anker, der nur einen
  Fundort schützt, schützt Kopien nicht — das war die Lücke.

## 6 · Mittel/Niedrig: Dokumentation — Zustand nur an einer Stelle

- **Ein-Implementierungs-Prinzip für Doku-Zustand:** Projektzustand lebt
  ausschließlich in CLAUDE.md „Aktueller Zustand"; `DEVELOPMENT.md`
  verliert seine eigenen Status-/„in Arbeit"-Angaben und verweist. Die
  konkreten Fehlangaben (V2b.1 „in Arbeit", 5 000 Mobilläufe,
  „Cron ohne Carry-forward-Flag") verschwinden damit strukturell, nicht
  nur redaktionell.
- `briefs/README.md`: Index vervollständigt (die vier fehlenden
  Spezifikationen 20–23 nachgetragen; künftig Teil der stehenden
  Ketten-Regel: neuer Brief = Ketteneintrag + Indexzeile im selben
  Commit).
- Übersicht: „sechs Karten" wird zahlenfrei formuliert („Der Stand der
  Saison in Karten"); README-Seitenliste um Modellgüte, Szenarien,
  Methodik und die Saison-/Archivdimension ergänzt.

## 7 · Ausdrücklich NICHT in diesem Brief

Linter/Typprüfung (Codex' Randempfehlung): eigene Entscheidung mit
eigenem Zuschnitt, nicht hier hineinquetschen — als Vorschlag notiert,
[USER] entscheidet bei Gelegenheit.

## 8 · Abnahme

- Interaktionsschicht läuft in CI (Teil von `npm test`), vier Startfälle
  grün; SSR-Harness unverändert.
- Remount-Key gesetzt; die drei Interaktionstests aus §2 grün.
- Tabs: Pfeil-/Home-/End-Steuerung, Test grün; keine Konsument-Änderung
  nötig (eine Komponente).
- `getOptionalJson`-Split mit beiden Testpfaden; Fehlerzustand gerendert
  und verankert.
- README-Satz korrigiert; repo-weiter Kausalmuster-Scan grün und schlägt
  bei konstruiertem Verstoß an (Selbsttest wie beim Hex-Scan).
- DEVELOPMENT.md ohne eigene Statusangaben; Brief-Index vollständig;
  Ketten-Regel erweitert; Übersichtstext zahlenfrei.
- Review-Dokument unter `docs/reviews/` abgelegt (Herkunft + Datum).
- Danach Version **2.3.2**, Tag + Release (Notes: Codex-Review-Fixes)
  nach stehender Regel; CLAUDE.md-Kette und Zustand.
