# Brief — Nachholspiel-Freeze + Lockfile-Gleichlauf (Codex-Audit 2026-08-05)

**Zwei Befunde aus dem unabhängigen Codex-Audit der letzten Änderungen,
beide verifiziert. §1 idealerweise vor Freitag auf `main` — Verlegungen
am 1. Spieltag sind unwahrscheinlich, aber der Fix ist klein und das
Zeitfenster kostenlos. Audit als `docs/reviews/2026-08-05-codex.md`
ablegen.**

## 1 · Hoch: Verlegte Spiele frieren am veralteten Anstoß ein

**Befund (reproduziert):** Die Freeze-Bedingung lautet
`kickedOff(fx.kickoff) || kickedOff(prior.kickoff)` — ist der ALTE
gespeicherte Anstoß vergangen, friert der Eintrag auch dann, wenn das
Spiel auf später verlegt wurde. Ein 8.-August-Spiel, verschoben auf den
20., behält Anstoß und Ratings vom 8. für immer.

**Fix — der Wächter ist das Ergebnis, nicht der alte Anstoß:**
- Eingefroren gilt ein Eintrag genau dann, wenn
  **das Spiel gespielt ist** (beide Tore vorhanden) **oder der AKTUELLE
  Anstoß vergangen ist** (`fx.kickoff <= Laufzeitpunkt`; unparsebarer
  Anstoß zählt weiter konservativ als vergangen). `prior.kickoff`
  verschwindet aus der Bedingung.
- Damit deckt der Ergebnis-Wächter die Sorge des alten Kommentars ab:
  Ein gespieltes Spiel bleibt eingefroren, selbst wenn sein Anstoß in
  den Quelldaten rückwirkend verfälscht würde. Und ein verlegtes,
  ungespieltes Spiel taut automatisch auf und rechnet bis zum neuen
  Anstoß weiter — auch im Retro-Fall (Absage am Spieltag selbst nach
  bereits erfolgtem Einfrieren).
- **`kickoff` kommt in die Substanz-Liste:** Eine Verlegung bei zufällig
  unveränderten Ratings muss den Eintrag trotzdem neu schreiben, sonst
  steht der alte Anstoß im Protokoll. (No-Churn bleibt gewahrt —
  Anstöße ändern sich nur bei echten Verlegungen.)
- Der Begründungskommentar wird ersetzt und erklärt beide Fälle.

**Tests:**
1. Verlegung vor dem alten Anstoß: neuer Anstoß + neuerer Snapshot →
   Eintrag folgt beidem (Codex' Reproduktion als Regressionstest).
2. Retro-Verlegung: alter Anstoß vergangen, Eintrag gefroren, Spiel
   OHNE Ergebnis wird auf die Zukunft verlegt → Eintrag taut auf und
   aktualisiert.
3. Ergebnis-Wächter: gespieltes Spiel, Anstoß nachträglich in die
   Zukunft editiert → Eintrag bleibt unverändert.

## 2 · Niedrig: Lockfile-Version läuft mit — als Regel und Wächter

- `package-lock.json` auf 2.3.3 synchronisieren
  (`npm install --package-lock-only`), im selben PR.
- **Stehende Regel ergänzt (CLAUDE.md, Versionsregel):** Ein
  Versions-Bump schließt den Lockfile-Gleichlauf im selben Commit ein.
- **Wächter:** ein kleiner Test vergleicht `apps/public/package.json`-
  Version mit dem zugehörigen Lockfile-Eintrag — schlägt bei Drift an.
  (Die stille Akzeptanz durch `npm ci` ist genau der Grund, warum es
  einen expliziten Wächter braucht.)

## 3 · Kenntnisnahme, keine Aktion

Der Codex-Hinweis, dass Tag `v2.3.3` die ungeheilten Julidaten enthält,
ist korrekt und akzeptiert: Tags konservieren den Moment, die Heilung
ist ein Datencommit danach — die Release-Notes sagen das bereits. Kein
nachträgliches Umtaggen (Historie bleibt ehrlich).

## 4 · Abnahme

- §1-Fix mit allen drei Tests grün; Gesamtsuite ohne Skips.
- Lockfile synchron, Wächter aktiv und schlägt bei konstruierter Drift
  an (Selbsttest), Regel in CLAUDE.md.
- Audit unter `docs/reviews/` abgelegt; Patch-Bump **2.3.4** mit Tag +
  Release nach stehender Regel (der Lockfile-Wächter bewährt sich damit
  direkt im eigenen Release-PR).
- CLAUDE.md-Kette und Zustand nach stehender Regel.
