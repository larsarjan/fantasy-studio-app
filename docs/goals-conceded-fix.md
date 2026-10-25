# Player-level match facts repair

## Root cause

`EspnSync.gs` imported `event/{round}/live.elements[].explain[].stats`, the
points explanation. Zero-point facts are omitted there: one conceded goal,
some saves, and clean sheets for positions without clean-sheet points.
`?? 0` converted absence into false zero. `player_match_stats.payload.goalsConceded`
then reached both the scoring engine and historical UI. Zero and one conceded
goal both cost zero points, so correct points did not establish correct facts.

## Repair

Use complete `elements[].stats` only for a single-fixture explanation. For
multiple fixtures use `element-summary/{id}.history`, matched uniquely by fixture.
Cache that history per player per round. Require every imported stat; missing
facts abort before Sheet rows are written. No team-score, clean-sheet or
minutes-based inference. Provider on-field counts include substitutions and
stoppage time; the app has no independent event timeline to reconstruct them.
Scoring rules are unchanged. The central count normalizer preserves unknown
as null; the UI reads the engine's count and does not display an invented zero.

## Read-only production/source audit (2026-10-25)

| Round | Verified played records | Wrong conceded values | Visible GK/DEF counts | Other differing facts | Changed fantasy totals |
|---|---:|---:|---:|---|---:|
| 1 | 285 | 114 | 30 | 5 clean-sheet flags | 0 |
| 5 (sample) | 188 | 112 | 19 | none | 0 |
| 9 (sample) | 247 | 126 | 21 | 1 clean-sheet flag | 0 |
| 10 | 124 | 76 | 18 | 1 clean-sheet flag | 0 |

SR10 includes all four fixtures with played records at capture time (082–085).
Remaining scheduled matches cannot yet be checked. Historical audit excluded
184 records requiring extra fixture/identity/DGW resolution; no claims for those.
Total checked: 844; incorrect conceded values: 428; visible GK/DEF labels: 88.
All checked goals, assists, minutes, saves, yellow/red cards, own goals,
penalties missed/saved and bonus matched. Seven clean-sheet flags differed
without changing points. Timing tests preserve provider on-field facts rather
than claiming an independent verification of event timestamps.

Actual SR10 source: Padt/Didden/Panagiotou/Zagre/Horemans=1; Vesterlund=0;
Didillon-Hodl=6; Dekker=3. Captured source fixture is committed with tests.

## Remaining manual source activation

No connected Google document session exists. No production Sheet or database
records were edited during this task. A frontend deployment alone cannot fix
the persisted false zeros; do not claim these records repaired before reimport.

1. In the existing bound Apps Script `EspnSync.gs`, update the function
   `syncEspnMatchStatsForRound` from this repository and add the new
   `resolveEspnMatchFacts` function. Leave other files and schedules unchanged.
2. Run existing `syncMatchStatsAutomatic` manually to repair recent finished
   rounds, including SR10. It preserves hand-written Status and Notitie.
3. Inspect `PLAYER_MATCH_STATS`: the six Utrecht values and Willem II controls
   above must match. Confirm the existing import control sheet has no errors.
4. Let the existing reference publication import the updated published Sheet;
   verify its successful receipt, then compare Supabase payloads and the UI.
5. Older rounds need explicit reimport using existing
   `syncEspnMatchStatsForRound(round, false)`, one round per manual execution.
   Do not create another scheduler or clear existing rows. Recheck points and
   source identities before treating older unmatched audit rows as repaired.

Validation: 231 regression tests, 291 isolated database/security checks,
production build, diff check. No availability changes.
