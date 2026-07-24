# Brief — Textmaß systematisch + Tabs für „Direkte Duelle"

**Presentation only. No engine, pipeline, artefact, or wording change (except
the two row-label additions in §2.3). One shared tab component — not a second
copy.**

## 1 · Textmaß: ein Token, Karte folgt Text

Problem: Karten spannen die volle Inhaltsbreite auf, Fließtext bricht bei
einem deutlich schmaleren Maß um — toter Rechtsraum, verschwendeter
vertikaler Platz.

- **Ein Design-Token `--measure-text`**, gesetzt auf **≈ 88 Zeichen** (`88ch`
  bzw. der bestehenden Typo entsprechend) — das obere Ende des gut Lesbaren.
  Jeder Fließtext (Seiten-Intros, `methodik-step`, Captions, Erklärtexte,
  Karteninhalte ohne Tabelle/Chart) konsumiert dieses eine Token. Keine
  Einzelfall-Breiten mehr; ein Quelltext-Scan (wie bei den Liganamen) darf
  gern verbieten, dass Fließtext-Elemente eigene `max-width`-Werte tragen.
- **Reine Textkarten ziehen sich auf das Maß zusammen** (Karte =
  `max-width: calc(var(--measure-text) + Karten-Padding)`), sodass Text- und
  Kartenrand zusammenfallen. Karten mit Tabellen, Charts oder dem
  Beispielsaison-Raster behalten die volle Breite.
- Mobile bleibt unverändert (dort greift ohnehin die Viewport-Breite).
- Abnahme per Rendertest: eine reine Textkarte ist nicht breiter als das Maß;
  eine Tabellenkarte ist es.

## 2 · „Direkte Duelle": Tabs wie bei der Szenario-Tabelle

### 2.1 Ein gemeinsames Tab-Bauteil
Die Tab-Mechanik der Szenario-Ergebnistabelle (Rollen `tablist`/`tab`/
`tabpanel`, ARIA-Verdrahtung, Vorschau-Labels) wird in eine **geteilte
Komponente** extrahiert, die beide Orte konsumieren. Ein Rendertest belegt,
dass es eine Komponente ist, nicht zwei — dieselbe Regel wie bei
`FixturePrediction`.

### 2.2 Tabs je Ziel
- Ein Tab je Ziel in Konfigurationsreihenfolge, **nur für Ziele mit
  mindestens einem Duell** (θ-Regel aus §4 unverändert, Default 10 %).
- Label mit Anzahl: „Platz 1–4 (7)". Vorwahl: das Ziel mit dem **brisantesten
  Einzelduell** (größtes `min(P_A, P_B)`), analog zur Größter-Effekt-Regel
  der Szenario-Tabs.
- Sortierung im Tab: **`min(P_A, P_B)` absteigend** — ein Duell ist am
  heißesten, wenn *beide* im Rennen sind; danach Spieltag aufsteigend als
  Zweitschlüssel.

### 2.3 Die Zeile wird selbsterklärend
- Die Ziel-Spalte entfällt (der Tab trägt das Ziel). An ihre Stelle tritt der
  **Spieltag** („34. Spieltag"), denn welches Spiel ein Rennen entscheidet,
  ist ohne das Wann nur die halbe Information.
- Die beiden Prozentwerte werden **den Klubs zugeordnet** statt unbeschriftet
  nebeneinanderzustehen — kompakt in der Form
  „Bayern 95,1 % · Stuttgart 38,5 %" (Kurzname wie in den übrigen Tabellen).
  Die Caption erklärt wie bisher die θ-Schwelle; kein weiterer Text.

## 3 · Abnahme

- Token vorhanden und einzige Quelle für Fließtextbreite; Scan gegen
  Einzelfall-`max-width` auf Fließtext; Rendertests Textkarte vs.
  Tabellenkarte.
- Geteilte Tab-Komponente an beiden Orten (Nachweis: eine Implementierung);
  Duell-Tabs mit Anzahl-Labels, Brisanz-Vorwahl, `min(P)`-Sortierung mit
  Spieltag-Zweitschlüssel; Ziel-Spalte durch Spieltag ersetzt; Werte mit
  Klubnamen.
- Leerzustand: gibt es ligaweit kein Duell über θ, bleibt die bestehende
  Karten-Verbergen-Regel (§7) in Kraft.
- CLAUDE.md-Kette und Zustand nach stehender Regel.
