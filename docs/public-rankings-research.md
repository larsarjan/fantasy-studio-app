# Phase 2 research — completed before enrichment implementation

Date: 2026-10-16. Phase 1 snapshot retained under ignored test-results/public-rankings/phase1.

## SR1
No exact historical Top 100 cohort found. Both individual sheet tabs and central
elite aggregates start at SR2. All 29 sheet tabs (including hidden tabs) were
inventoried through the normal public XLSX export. Apps Script stores the manager
cohort only in ELITE_MANAGERS. The database has 102 prominent SR1 snapshots, not a
general league Top 100. The public league standings endpoint returns current
standings; bootstrap phases are season/months, not individual historical rounds.
Individual known managers' SR1 picks cannot establish the missing full cohort.
Conclusion: not reconstructable from verified available sources. Do not invent it.

## Exact missing fields
Normal unauthenticated ESPN API `/api/entry/25181/event/8/picks/` returned:
entry_history.event=8, points_on_bench=11, value=1028, bank=21,
event_transfers=2, event_transfers_cost=0, and 15 picks.
These are official stored per-round values. No estimated transfer allowance,
price sum, FVT score conversion or simulated bench score is needed.

- Bank points: exact official points_on_bench is available.
- Team value: exact official entry_history.value is available, in tenths of a
  million, following the existing prominent snapshot normalization. It is not
  relabelled or substituted with a current-price squad sum.
- Transfer count/cost: exact event_transfers / event_transfers_cost is available;
  free transfers must not be inferred from differences between squads.
- Incoming/outgoing: retain existing deriveTransfers and its temporary-chip flag.

## Source conflict
`/api/entry/1115/event/6/picks/` independently confirms the existing immutable
central record: total_points=480, overall_rank=1, points=84. The sheet's 398/rank7
was captured earlier. Keep the central record. Cohort membership still comes from
the stored sheet StandingIndex, never today's rank. Label this as the stored cohort.

## Phase 3 decision
Reuse createEspnClient and normalizeSnapshot to read/cache official missing
fields server-side for only the active cohort/round or selected manager history.
Validate current API season and exact squad/captain/vice identity before attaching
values. Keep sheets as cohort/identity/picks source; never mutate either sheet or
persist/overwrite existing snapshots. On absent/mismatching/unreachable sources
keep null and report incomplete coverage. No new sync job, persistent table or
alternate cohort source. Only the two supplied CSV tabs are added to allowlist.
