# Brief — Szenarien-Ergebnistabelle: Tabs + Textrevision

**Presentation only, plus ONE content correction in Methodik Schritt 1 (a
wrong causal claim, §8-relevant). All replacement texts below are verbatim —
use them as written, do not paraphrase. No engine, pipeline, or artefact
change.**

## 1 · Ergebnistabelle: Tabs je Ziel-Kategorie

The flat |Δ|-sorted list mixes all targets and gets very long. Restructure:

- **One tab per target** of the league (Meister, Platz 1–4, Platz 5–6,
  Klassenerhalt, Relegationsplatz, Abstieg; Herbstmeister while it exists),
  in the league config's target order. Within a tab: clubs sorted by |Δ|
  descending, columns unchanged (vorher / im Szenario / Veränderung).
- **Tabs render only for targets with at least one supra-noise change**; a
  target with none simply has no tab. If no target has any, the existing
  empty state shows (revised wording, §2.4).
- **Default tab = the target containing the single largest |Δ|** — the
  headline effect is visible without a click.
- Tab labels carry a count and the largest change as a preview, e.g.
  „Meister (5 · −14,8 Pp.)", so scanning the tab bar already tells the story.
- Keyboard/ARIA: proper `tablist`/`tab`/`tabpanel` roles per the existing
  accessibility conventions.

## 2 · Textrevisionen — wörtlich

### 2.1 Szenarien, Seiten-Intro
Alt: „Zum Durchspielen: eigene Ergebnisse festsetzen und sehen, wie sich die
Wahrscheinlichkeiten verschieben. Alles läuft im Browser und wird nirgends
gespeichert."
Neu:
> Was wäre, wenn …? Ergebnisse festsetzen und sehen, wie sich die Prognose
> verschiebt. Alles läuft im Browser und wird nirgends gespeichert.

### 2.2 Szenarien, Explainer (die drei Zustände)
Alt: „Jedes offene Spiel ist zunächst simuliert — sein Ergebnis wird in jedem
Durchlauf aus der Torverteilung gezogen. Du kannst ein Spiel festsetzen, dann
gilt es als gespielt. Anschließend rechnest du das Szenario: dieselbe
Simulation läuft mit denselben Zufallszahlen erneut, und die Tabelle zeigt,
welche Wahrscheinlichkeiten sich dadurch verschieben. Nur exakte Ergebnisse —
kein Tendenz-Was-wäre-wenn."
Neu:
> Jedes offene Spiel ist zunächst **simuliert**: Sein Ergebnis wird in jedem
> Durchlauf neu ausgewürfelt — mal so, mal so, gemäß den Torraten beider
> Klubs. Setzt du ein Spiel **fest**, gilt stattdessen in allen Durchläufen
> genau dieses Ergebnis. Dann **Szenario rechnen**: Dieselbe Simulation läuft
> erneut, mit demselben Zufall — Veränderungen kommen so wirklich von deinen
> Ergebnissen und nicht vom Würfeln.

(Der Satz „Nur exakte Ergebnisse — kein Tendenz-Was-wäre-wenn" entfällt:
Insider-Sprache; die Beschränkung ist durch die Eingabe selbst offensichtlich.)

### 2.3 Szenarien, Caption der Ergebnistabelle
Alt: „Gezeigt werden alle Klubs und Ziele, deren Wahrscheinlichkeit sich über
das Rauschen hinaus ändert — auch Klubs, deren Spiele nicht festgesetzt
wurden: Tabelle und Restprogramm koppeln sie. Änderungen unterhalb der
Rauschschwelle sind ausgeblendet (20 000 Läufe)."
Neu:
> Alle Klubs, deren Chancen sich spürbar ändern — auch ohne eigenes
> festgesetztes Spiel, denn jedes Ergebnis verschiebt zugleich die Rechnung
> der Konkurrenten. Unterschiede, die auch reiner Zufall erzeugen könnte,
> sind ausgeblendet (gerechnet mit 20 000 Durchläufen).

### 2.4 Szenarien, Leerzustand der Tabelle
Alt: „Keine Veränderung über dem Rauschen — die festgelegten Ergebnisse
verschieben die Wahrscheinlichkeiten nicht messbar."
Neu:
> Keine messbare Veränderung — die festgesetzten Ergebnisse verschieben die
> Wahrscheinlichkeiten nicht stärker, als es der Zufall auch könnte.

### 2.5 Methodik, Schritt 1 — INHALTSKORREKTUR, nicht Stil
Alt (letzter Satz): „Ein Favorit gewinnt darum nicht in jedem Durchlauf."
**Der Kausalzusammenhang ist falsch.** Das „darum" hängt an der
`RATING_SIGMA`-Streuung — aber die bildet Unsicherheit über die *Stärke* ab,
nicht den Spielzufall; §3 sagt das wörtlich („uncertainty about strength, not
match-level randomness"). Warum Favoriten Spiele verlieren, erklärt Schritt 2
(die Torziehung), nicht Schritt 1. Der Satz lehrt Lesern exakt die
Verwechslung, die der Simulationsvertrag verbietet.

Schritt 1 neu (vollständiger Absatz):
> Als Eingabe dienen die Elo-Ratings von clubelo.com — eine Zahl je Klub für
> die aktuelle Spielstärke. Wir kennen die wahre Stärke aber nicht exakt:
> Jede simulierte Saison nimmt deshalb eine leicht andere an, gesteuert von
> einer festen Streuung um das Rating. Diese Streuung bildet unser Unwissen
> über die Stärke ab — der Zufall eines einzelnen Spiels kommt erst in
> Schritt 2.

Schritt 2, Ergänzung nach dem Poisson-Satz (vor „So sieht die Vorhersage…"):
> Ein Favorit gewinnt darum nicht jedes Spiel — auch bei klaren
> Wahrscheinlichkeiten fällt jedes Ergebnis einzeln.

### 2.6 Methodik, Leerzustand Schritt 3
Alt: „Für die Beispielsaison wird die committete Simulation gebraucht; sie
liegt noch nicht vor." — „committete" ist Entwicklerjargon in einer Nutzer-UI.
Neu:
> Die Beispielsaison braucht die aktuelle Prognoserechnung; sie liegt noch
> nicht vor.

### 2.7 Solver-Intro (unsichtbar bis Frühjahr): eine Mini-Politur, optional
„…bei Punktgleichheit zählt der Vergleich zuungunsten des Klubs…" →
„…wird bei Punktgleichheit zuungunsten des Klubs entschieden…". Sonst ist der
Text gut und bleibt.

## 3 · Abnahme

- Tabs je Ziel mit |Δ|-Sortierung, Vorschau-Labels, Default auf dem größten
  Effekt, leere Ziele ohne Tab, ARIA-Rollen; Rendertest deckt Default-Wahl
  und Leerzustand ab.
- Alle Texte aus §2 wörtlich übernommen; ein Test verankert den korrigierten
  Schritt-1-Wortlaut (der falsche Kausalsatz darf nicht zurückkehren).
- Keine weiteren Textänderungen über §2 hinaus — mehr Text ist ausdrücklich
  nicht das Ziel.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
