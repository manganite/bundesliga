# Interner Sweep — die Freeze-Familie (2026-08-05)

Kein fremdes Audit, sondern die eigene Nachsuche nach **weiteren Fällen derselben
Fehlerfamilie**, nachdem zwei davon binnen eines Tages von außen kamen: der
verworfene Fenster-Entwurf (Brief 29) und die Freeze-Bedingung am gespeicherten
Anstoß (Brief 30, Codex).

## Umfang

Gesucht wurde nach zwei Mustern:

1. **Zustandsgrenzen, die gegen einen gespeicherten statt den aktuellen Wert
   prüfen** — eine Grenze gegen einen alten Wert ist eine andere Grenze.
2. **Cache- und Einfrier-Prämissen, die eine Verlegung bricht** — „das kann sich
   nicht mehr ändern" als Behauptung statt als Eigenschaft.

Durchgesehen: `artefacts.mjs` (beide Timelines), `preMatch.mjs`, `snapshots.mjs`,
`carryForward.mjs`, `reconstruct.mjs`, `metrics.mjs`, die Datums- und
Zustandslogik in `apps/public/src/lib/`, App B.

## Fund: ein echter, mit drei Gesichtern

**Die Timeline-Punkte cachen eine gebrochene Prämisse** — Begründung, Ausmaß und
Fix in [../briefs/AUDIT_FAMILIE_BRIEF.md](../briefs/AUDIT_FAMILIE_BRIEF.md) §1/§2,
Bestandsprüfung in [timeline-vollstaendigkeit.md](../verification/timeline-vollstaendigkeit.md).

Kurz:

1. Punkte wurden berechnet, sobald *irgendein späterer* Spieltag begonnen hatte —
   nicht, wenn der eigene vollständig war. Ein Spieltag mit verlegtem Spiel ging
   mit 8 von 9 Ergebnissen in den Cache und blieb dort.
2. Der Rating-Stichtag der Live-Timeline hing davon ab, **wann** der Cron den
   Punkt zuerst berechnet hat.
3. Retroaktiv gebaute und live gewachsene Timelines hatten damit
   **unterschiedliche Bedeutung** bei gleichem Artefakttyp — womit auch die
   Determinismus-Zusage (Regeneration bitgleich) fiel.

Das dritte Gesicht ist zugleich der Beleg: dass die Bestandsdaten sauber sind,
liegt daran, dass Saison 2025/26 im Juli 2026 retroaktiv neu gebaut wurde. Wäre
der live gewachsene Stand stehen geblieben, trügen Spieltag 16 und 17 dieser
Saison unvollständige Punkte.

## Untersucht und unauffällig

- **Rating-Rekonstruktion** (`reconstruct.mjs`) — Nachholspiel-Test existiert.
- **`remainingFixtures`** — ergebnis-, nicht zeitbasiert; eine Verlegung ändert nichts.
- **Snapshot-Archiv** — append-only by design; kein Zustand, der veralten kann.
- **Provenienz-Klassifikation** — rechnet seit Brief 30 stets mit dem aktuellen Anstoß.
- **App B** — kein Anstoß- oder Datumsbezug.

## Was daraus Methode wurde

Die Grenzfall-Tabelle [grenzfaelle.md](../verification/grenzfaelle.md): Für jede
Datums- oder Zustandsgrenze die Fälle, die sie treffen muss — darunter, genau
darauf, darüber, und was passiert, wenn sich der verglichene Wert nachträglich
bewegt. Von den vier Kandidaten des Inventars waren drei bereits abgedeckt; der
Duell-Schwelle fehlte die Gleichheitskante, sie ist ergänzt.
