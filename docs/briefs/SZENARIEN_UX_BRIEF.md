# Brief — Szenarien UX polish + Methodik page

**Presentation only, with one spec amendment carried in §2.1 (the §10
refinement and the new §7 page). No engine change, no metric change, no new
mechanism — if a task seems to need one, stop and report. The §3 machinery
(CRN, paired-batch SE, 2·SE floor) and the §7 simplicity rules stay
binding.**

User feedback on the live page found seven real problems in the what-if tool
and three in the Beispielsaison. All are presentation; two stem from the UI
misrepresenting the underlying state.

## 1 · What-if

### 1.1 Matchday grouping
One list of 40+ fixtures overwhelms. Group by matchday: show one matchday
(9 fixtures), a selector for the others, defaulting to the **next unplayed
matchday**. Fixtures fixed on *other* matchdays remain visible in a compact
„Festgesetzt (3)" summary above the table so no fixed result is ever
invisible while it is in force.

### 1.2 Open fixtures must not display a score
The 0-0 default input reads as an assumption; the simulation assumes no such
thing. An open fixture shows **no score input** — it shows its state:
„**Simuliert** — Heimsieg 48 %, wahrscheinlichstes Ergebnis 2:1" (favourite
tendency with its probability, plus the modal scoreline from the engine's
scoreline matrix; both come from `predictMatch`, computed where the page
already gets its per-fixture predictions — no new engine function).

### 1.3 Fixing a result: explicit action, honest prefill
Per fixture a „Festsetzen"-action opens the score input, **prefilled with the
modal scoreline** (the same one shown in 1.2), which the user then edits.
Rationale to preserve in a code comment: editing from the model's most likely
result makes the *change* meaningful — turning a likely 2:1 into a 0:2 is a
visible decision; editing from 0-0 is guessing in the dark. A fixed fixture
displays as „**Festgesetzt: 0:2**" with a per-fixture reset; „alles
zurücksetzen" stays.

### 1.4 No auto-run — an explicit button, with a stale indicator
Changing or resetting fixtures does **not** trigger simulation. A primary
button „Szenario rechnen" runs it; after any input change the previous result
table is dimmed and labelled „Eingaben geändert — Ergebnis veraltet" until
rerun. The run count and „rechnet…" progress stay as they are.

### 1.5 The result table must say what it is
Title: „Veränderung gegenüber der unveränderten Prognose". Directly beneath,
one sentence that closes the biggest comprehension gap: „Gezeigt werden alle
Klubs und Ziele, deren Wahrscheinlichkeit sich über das Rauschen hinaus
ändert — auch Klubs, deren Spiele nicht festgesetzt wurden: Tabelle und
Restprogramm koppeln sie." Sorted by |Δ| as today; the „unverändert"
suppression gets its half-sentence („Änderungen unterhalb der
Rauschschwelle sind ausgeblendet").

### 1.6 Help text rewritten around the three states
The explainer describes the mechanics in user language, in this order: ein
Spiel ist **simuliert** (aus der Torverteilung gezogen), oder du setzt es
**fest** (es gilt als gespielt), dann **rechnest du das Szenario** — dieselbe
Simulation läuft erneut mit denselben Zufallszahlen, und die Tabelle zeigt,
welche Wahrscheinlichkeiten sich dadurch verschieben. Keep it to three or
four sentences; the current texts describe features, not the process.

## 2 · Beispielsaison moves — a new didactic page „Methodik"

User decision: the Beispielsaison does not belong on Szenarien. What-if is an
analysis tool; the Beispielsaison is an explanatory exhibit. They answer
different questions and confuse each other's framing. Therefore:

### 2.1 Spec amendment (goes into the precedence chain via this brief)
§10's rule „interactive tools only on Szenarien" is **refined, not broken**:
*analytic* interaction — inputs that alter forecasts — remains exclusive to
Szenarien. The new page carries exactly **one illustrative widget** (the
Beispielsaison), which analyses nothing and changes nothing; it shows. §7's
page table gains the page; the Szenarien header drops the sample-season
clause and describes only the what-if.

### 2.2 The page: „Methodik" (nav label), page title „So entsteht die Prognose"
A four-step narrative in plain German, each step 2–4 sentences, reusing only
outputs the app already computes — no new engine functions, no new numbers:

1. **Stärke.** clubelo-Ratings als Eingabe, und die ehrliche Pointe von
   `RATING_SIGMA`: „Wir kennen die wahre Stärke nicht exakt — jede simulierte
   Saison nimmt deshalb eine leicht andere an." Ein Satz zur Rating-Aktualität
   mit Link auf die Modellgüte-Karte.
2. **Ein Spiel.** Poisson + Dixon-Coles in einem Satz; als lebendes Beispiel
   die bestehende `predictMatch`-Ausgabe des nächsten echten Spiels
   (Tendenzwahrscheinlichkeiten und wahrscheinlichstes Ergebnis — dieselbe
   Darstellung wie im What-if-Zustand „Simuliert", §1.2).
3. **Eine Saison.** Die Beispielsaison als Exponat, mit allem aus dem alten
   §2: Ergebnisse nach Spieltagen, echte Resultate visuell unterschieden,
   „Neue Beispielsaison auswürfeln" mit angezeigter und editierbarer
   Laufnummer („Lauf #14 382 von 20 000"), session-only. Rahmensatz: „Das ist
   EIN vollständiger Durchlauf — so verschieden können Saisons ausgehen, die
   alle zur aktuellen Prognose passen."
4. **20 000 Saisons.** Aus den Durchläufen werden die Prozente der übrigen
   Seiten; der §0-Satz („Die Prognose verändert sich durch neue Ergebnisse
   und aktualisierte Ratings. Die Modellparameter bleiben während der Saison
   unverändert.") und der Brückensatz zur Modellgüte: „Ob die Prozente
   stimmen, prüft die Kalibrierung."

Simplicity rules apply: one primary element (the Beispielsaison in step 3),
no metric duplicated — steps link to Modellgüte and Verlauf instead of
repeating their charts.

## 3 · Acceptance

- What-if: matchday grouping with next-matchday default and the fixed-summary
  line; open fixtures show state + tendency/modal info and **no score
  widget**; fixing prefills the modal scoreline; no simulation without the
  button; stale dimming works; table title + coupling sentence + noise-floor
  half-sentence present; explainer rewritten around simuliert → festgesetzt →
  rechnen.
- Methodik page live with the four-step narrative; the Beispielsaison lives
  there and **only** there (matchday grouping, framing sentence, random draw
  with displayed and enterable run index); Szenarien carries only the
  what-if and its header says so; the §10 refinement (analytic vs.
  illustrative interaction) is recorded in this brief's entry in the
  CLAUDE.md precedence chain.
- Render tests cover: open vs. fixed vs. stale states; a fixed fixture on a
  non-selected matchday appearing in the summary; the Beispielsaison index
  round-trip on the Methodik page (enter index → identical rendering to that
  run); step 2 shows the same fixture presentation as the what-if „Simuliert"
  state (one component, not two).
- No engine or pipeline change; artefacts untouched; CLAUDE.md chain and
  state per the standing rule.
