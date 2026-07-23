# Gate 7 — Trägt der Track-C-Fit per-league Felder? ✅ Ja

**Quelle:** `football-model-lab`, `report/params-track-c-part0.json`, erzeugt von
`scripts/run-track-c-part0.mjs`. Gelesen am 2026-07-23.

§2 stellte die Frage, weil BL1 und BL2 messbar unterschiedlich viele Tore
erzielen und die Apps per-league Parameter **niemals selbst synthetisieren**
dürfen. Antwort: der pooled Fit trägt sie.

## Befund

`keptDeltas` des Track-C-Fits — also die Abweichungen, die sich auf
held-out-Evidenz „verdient" haben:

```json
"modelKeys": ["BASE_TOTAL","ELO_PER_GOAL","RHO","HOME_ADV",
              "HOME_ADV_GHOST","HOME_ADV_BL2","BASE_TOTAL_BL2","ELO_PER_GOAL_BL2"],
"keptDeltas": ["HOME_ADV_BL2","BASE_TOTAL_BL2","ELO_PER_GOAL_BL2"]
```

`fullFit` (pooled BL1+BL2, 15 Saisons 2011/12–2025/26, gleichgewichtet):

| Feld | Wert |
|---|---|
| `BASE_TOTAL` | 3,0279202615048213 |
| `ELO_PER_GOAL` | 213,02074119618948 |
| `HOME_ADV` | 68,91055375224373 |
| `RHO` | −0,10088172337685239 |
| `MAX_GOALS` | 10 |
| `ET_FACTOR` | 0,3333333333333333 |
| `RATING_SIGMA` | 100 |
| `BASE_TOTAL_BL2` | −0,22048618532780445 |
| `ELO_PER_GOAL_BL2` | 14,6473666962757 |
| `HOME_ADV_BL2` | −4,055085798617771 |
| `HOME_ADV_GHOST` | −24,246303437330884 |
| `HOME_ADV_GHOST_BL2` | 0 |

Die BL2-Felder sind **additive Deltas auf die pooled Werte**, keine eigenständigen
Parametersätze. Die Anwendungsregel ist im Lab dokumentiert
(`src/trackc.mjs`, `effectiveParams`) und wird von der Engine wörtlich
übernommen — nicht neu hergeleitet:

```
HOME_ADV_eff     = HOME_ADV     + (bl2 ? HOME_ADV_BL2     : 0)
                                + (ghost ? HOME_ADV_GHOST + (bl2 ? HOME_ADV_GHOST_BL2 : 0) : 0)
BASE_TOTAL_eff   = BASE_TOTAL   + (bl2 ? BASE_TOTAL_BL2   : 0)
ELO_PER_GOAL_eff = ELO_PER_GOAL + (bl2 ? ELO_PER_GOAL_BL2 : 0)
```

Damit ist der in §2 beschriebene Ausweichfall — „BL2 erbt die pooled Baseline"
— **nicht** eingetreten: BL2 bekommt eine eigene Torrate
(3,0279 − 0,2205 = 2,8074), einen eigenen Elo-Maßstab und einen eigenen
Heimvorteil, alle aus dem Fit, keiner synthetisiert.

## Ghost-Term

`HOME_ADV_GHOST` gehört zum Fit, gilt aber nur für Spiele im COVID-Fenster
(2020-03-11 bis 2021-06-01, so im Lab definiert). Für die aktuelle Saison ist er
inaktiv. Die Engine führt ihn mit, damit historische Replays (V2) korrekt
rechnen, und wendet ihn ausschließlich auf Spiele innerhalb des in der
Saisonkonfiguration hinterlegten Fensters an.

Das 95-%-Intervall des pooled Ghost-Effekts ist `[−50,8; +10,5]` und schließt
null ein. Jede Anzeige dazu folgt §8: kein messbarer Effekt ist **nicht** „es
gibt ihn nicht", und über die Geisterspielsaisons wird keine kausale Aussage
gemacht.

## Was ausgeliefert wird

`data/season-params.json` übernimmt `fullFit` unverändert und ergänzt Herkunft:
Fitdatum, Saisonfenster, pinned Lab-Commit, Prozedurversion. Track A (BL1-only)
wird ausdrücklich **nicht** verwendet, wie §2 verlangt.
