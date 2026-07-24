# Brief — Übersicht-Karten, Header, Footer

**Presentation, mit zwei verbuchten Spezifikationsänderungen (§2.4, §2.5 —
beide entfernen Nutzerkontrollen, keine fügt Mechanik hinzu). Keine Engine-,
Pipeline- oder Artefaktänderung; die Szenarien-Laufzahl ist eine
Aufrufparameter-Änderung des bestehenden Workers.**

## 1 · Nachzügler: Caption der Restprogramm-Schwere beziffern

Die Caption nennt den Grund der Heim/Auswärts-Trennung jetzt qualitativ.
Sie wird **datengetrieben beziffert**: „… weil dasselbe Gegner-Rating
auswärts um rund {HOME_ADV, gerundet auf ganze Punkte} Elo-Punkte schwerer
wiegt." Der Wert kommt zur Laufzeit aus `season-params.json` (liga-effektiv
via `effectiveParams`), niemals hart codiert — er macht den jährlichen Refit
automatisch mit. Test: Caption enthält den gerundeten Parameterwert.

## 2 · Die vier Punkte

### 2.1 Platzierungszonen-Karte: Besetzung statt „Führend"
Zwei Fehler: Meister- und Abstieg-Zeile duplizieren die Spitzen der
Nachbarkarten, und „Führend" beantwortet bei Mehrplatz-Zonen die falsche
Frage. Neu:
- Die Karte zeigt **nur die Zonen ohne eigene Karte**: Platz 1–4, Platz 5–6,
  Relegationsplatz.
- Je Zone die **drei wahrscheinlichsten Klubs mit Balken und Prozentwert** —
  dasselbe visuelle Vokabular wie Titelrennen/Abstiegskampf.
- Die ehrliche Qualifikations-Caption bleibt wörtlich erhalten
  („Platzierungswahrscheinlichkeiten, keine Qualifikationen …").
- Herbstmeister (solange aktiv) bleibt, wo er heute ist; er bekommt keine
  Zeile hier.

### 2.2 „Wichtigstes kommendes Spiel": entzerren + §10-Toggle
- **Zeilenlayout statt Tabelle**, kein horizontaler Scroll: je Eintrag zwei
  Zeilen — „25. Sp. · Dortmund – Bayern" / „Meister · 10,8 Pp." — mit den
  **Kurznamen** der Klubs. Sekundärzahlen (Ausgangswahrscheinlichkeiten,
  Stichprobengrößen) verschwinden aus den Zeilen.
- **Caption nach §10 geteilt.** Sichtbar bleiben zwei Sätze:
  > Misst, wie eng ein Spiel mit diesem Zielrennen zusammenhängt — nicht,
  > um wie viele Punkte sich die Anzeige nach dem Spiel ändert. Je größer
  > die Verschiebung, desto mehr hängt an diesem Spiel.
  Hinter einem „Wie gerechnet?"-Toggle steht der bisherige Methodikteil
  (Verteilungsabstand, Gewichtung, Mehrplatz-Normalisierung, Laufzahl,
  kleinste bedingte Stichprobe). **Kein Ehrlichkeitsinhalt entfällt** — die
  §4-Pflichten (keine Prognose-Behauptung, Stichprobenangabe) sind zwischen
  Sichtbarem und Toggle vollständig abgedeckt; der Wortlaut-Verankerungstest
  wird auf beide Teile erweitert.

### 2.3 Footer: drei Zeilen, Technik zur Methodik
- Zeile 1 — Identität: „Bundesliga-Simulator · v{version} · Code GPL-3.0 ·
  Quellcode". Version zweiteilig: eine gepflegte Release-Nummer aus
  `package.json` (Start: `2.1.0`, ab jetzt je Release-Brief gebumpt —
  stehende Regel in CLAUDE.md) plus Build-Stempel (Kurz-Hash, Datum) via
  Vite-`define` automatisch injiziert.
- Zeile 2 — der §0-Satz, unverändert. Er ist die Ehrlichkeits-Signatur der
  App und bleibt sitewide.
- Zeile 3 — Quellen kurz: „Ergebnisse & Spielpläne: OpenLigaDB (ODbL 1.0) ·
  Ratings: clubelo.com". Die **Parameter-Provenienz** (track-c-part0-v1,
  Fit-Datum, Fenster) zieht in Methodik Schritt 4 um — dort beantwortet sie
  eine Frage, im Footer war sie Rauschen.

### 2.4 Header: Läufe-Auswahl entfällt [Spec-Amendment]
- Die Auswahl der Simulationsläufe wird entfernt; alle Seiten zeigen das
  kanonische 20 000er-Artefakt. Damit verschwindet auch die Jargonzeile
  „aus dem committeten Artefakt".
- **Verbucht als Amendment:** §3 „user-adjustable" und die Mobile-Default-
  Regel sind aufgehoben; der §7-Header führt keine „simulation controls"
  mehr. Der Worker bleibt — er dient nur noch den Szenarien.
- Begründung ins Amendment: die Kontrolle wurde real nie genutzt (Befund aus
  der WM-App), und „eine Simulation je Datenstand" wird ohne sie sogar
  wörtlicher wahr.

### 2.5 Szenarien: fix 2 000 Läufe [Spec-Amendment]
- Das Was-wäre-wenn rechnet fest mit **2 000 Läufen** (B = 20 Batches à
  100), keine Auswahl. Der Preis wird benannt, nicht versteckt: die
  2·SE-Schwelle wächst gegenüber 20 000 um ≈ Faktor 3, kleine Fernwirkungen
  fallen häufiger unter „unverändert". Caption-Zusatz (ein Halbsatz):
  „gerechnet mit 2 000 Durchläufen — kleine Verschiebungen erscheinen als
  ‚unverändert'."
- CRN, Paired-Batch-SE und alle Schlüssel unverändert; die ersten 2 000
  Läufe sind per Schlüsseldesign ein Präfix der kanonischen 20 000
  (`runCount` steckt in keinem Schlüssel).
- Die Beispielsaison (Methodik) ist unberührt — sie zieht einzelne Läufe
  aus dem kanonischen Raum, ihre Anzeige „von 20 000" bleibt korrekt.

### 2.6 Header-Untertitel [USER]
Der aktuelle Satz ist korrekt und blutleer. Default, falls du nichts
anderes wählst:
> Die Saison, 20 000-mal durchgespielt.
Alternativen: „Wahrscheinlichkeiten statt Bauchgefühl — 20 000 simulierte
Saisons." / „Wer steigt ab, wer wird Meister? 20 000 Antworten, täglich
aktualisiert." Eine Zeile, keine Behauptung über Treffsicherheit (§8).

## 3 · Abnahme

- Restprogramm-Caption mit gerundetem `HOME_ADV`-Wert aus den Parametern
  (Test).
- Platzierungszonen: drei Zonen × Top 3 mit Balken; keine Meister-/
  Abstieg-Zeile; Qualifikations-Caption wörtlich erhalten.
- Wichtigstes Spiel: zweizeilige Einträge mit Kurznamen, kein horizontaler
  Scroll (Rendertest bei schmaler Breite); Zwei-Satz-Caption sichtbar,
  Methodikteil im Toggle; Verankerungstest über beide Teile.
- Footer dreizeilig wie §2.3; Version + Build-Stempel gerendert;
  Parameter-Provenienz auf Methodik Schritt 4 (dort per Test verankert, im
  Footer per Scan verboten).
- Kein Läufe-Selector im DOM; Szenarien-Worker läuft mit 2 000/B = 20;
  Caption-Halbsatz vorhanden; die Amendments (§2.4, §2.5) in der
  CLAUDE.md-Vorgabekette als Brief 13 mit Begründung.
- Untertitel gemäß [USER]-Wahl bzw. Default.
