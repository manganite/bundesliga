# Prompt — Erscheinungsbild: Header-Marke, README-Banner, Bildfamilie

**Anlass: Das OG-Bild (Facebook-Teilen) ist gestaltet, Header und README
sind nackt — und das Favicon ist ein drittes, fremdes Motiv. Ziel: eine
Bildfamilie (das Balkenmotiv des OG-Bildes), dunkelmodus-tauglich,
zurückhaltend — die App ist ein Werkzeug, keine Marketing-Seite.
App-only, kein Pipeline-Bezug; Patch-Bump (nutzersichtbar).**

## 1 · Header-Marke (App)

- Die mitgelieferte `logo-mark.svg` (aufsteigende Balken, Verlauf
  #2f6fe0 → #8db9ff — die OG-Blautöne, aufgehellt, damit sie auf
  dunklem Grund tragen) kommt als Marke **links neben das h1**, Höhe
  ≈ 1,3 em der h1-Zeile, `aria-hidden="true"` (das h1 bleibt der
  Textanker; kein alt-Text-Doppel).
- **Eine Komponente für beide Header-Varianten** (App.jsx nutzt zwei
  Header-Blöcke) — Ein-Implementierungs-Prinzip wie bei den geteilten
  Komponenten; ein Render-Test je Variante: Marke genau einmal.
- Sonst nichts: keine Hintergrund-Verläufe, keine Farbbanner — Titel
  und Untertitel bleiben Text wie bisher. Die Marke ist das einzige
  neue Element.
- Hex-Werte leben ausschließlich in der SVG-Datei (wie bei
  `og-image.png`/`favicon.svg` — Assets sind vom Token-Hex-Scan
  ausgenommen; falls der Scan SVGs erfasst, Ausnahme dokumentiert
  begründen, nicht Tokens in Assets erzwingen).

## 2 · README-Banner (GitHub)

- Das bestehende `og-image.png` als Banner an den Kopf des README,
  verlinkt auf die App; Badges bleiben direkt darunter:
  `[![Bundesliga-Simulator](apps/public/public/og-image.png)](https://manganite.github.io/bundesliga)`
- Relativer Bildpfad (Repo-intern), damit das Banner in Forks/Clones
  nicht auf die Live-Seite zeigt — die Link-Lektion aus den Audits gilt
  auch hier.
- Keine weitere README-Umgestaltung in diesem PR.

## 3 · [USER] Favicon-Vereinheitlichung (optional, eigene Entscheidung)

Das aktuelle Favicon (N-Monogramm im blauen Quadrat) stammt aus einer
anderen Bildwelt. Option: durch die Balkenmarke im abgerundeten Quadrat
ersetzen (gleiches Blau #1f5fd0 als Grund, Balken in Weiß — bei 16 px
trägt ein Verlauf nicht). Wenn ja: eigener kleiner Commit im selben PR;
wenn nein: bleibt, und die Familie ist eben zweistimmig.

## 4 · Abnahme

- Marke in beiden Header-Varianten sichtbar (Desktop + Mobil geprüft),
  Render-Tests grün; README zeigt Banner über den Badges; Suite ohne
  Skips; Patch-Bump mit Tag + Release nach stehender Regel.
- Kein Eingriff in Pipeline/Daten — der Deploy baut aus unverändertem
  Datenstand.
