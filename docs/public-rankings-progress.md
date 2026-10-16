# Public rankings integration

Baseline: c78924dbe4eb0929bc9c537713d212dc0f63da28.

## Phases and architecture
Phase 1 completed before research or enrichment: regression, endpoint, CMS,
PostgreSQL, build and 26 browser checks passed. Stable source/check snapshot is
saved under ignored test-results/public-rankings/phase1. No phase-1 deployment.
Phase 2 findings were recorded in public-rankings-research.md before phase 3.

Only two existing CSV tabs were added to the existing fetchSheet allowlist:
spreadsheet 1OqFPkXS200cj2l1C9Gz0q9IMMpRyn_ElBcBqDuHUXE4,
ELITE_MANAGERS (1065866082), ELITE_TEAM_SNAPSHOTS (1228402931).
The former supplies historical cohort/ranking identity; the latter supplies
selection, XI, bench, captain and vice-captain. ESPN EntryId is canonical.
No collector, scheduled sync, migration or snapshot write was added.

The public-rankings endpoint reads existing public RLS-protected data, combines
round-scoped membership server-side, and returns compact aggregates. Existing
central records win conflicts. Only a requested manager receives individual picks.
The existing full manager detail UI and its five tabs remain intact.

Phase 3 reuses createEspnClient and normalizeSnapshot for exact official missing
bankpoints, team value, bank, transfer count and transfer cost. Season and full
stored squad/captain/vice must match. Read-through bounded caches coalesce work;
failures retain unknown values. Current cohort/round and requested manager history
are enriched, never a new persistent data source or historic snapshot overwrite.

## Coverage and limitations
Season 2026-2027: Top 100 has 100 complete teams in each SR2-8. SR1 has no exact
verified cohort and remains unavailable. Existing groups: FVT 86, ESPN 18,
Creators 6; SR8 union 203 unique entries, with one Top100/FVT overlap.
Group comparison uses memberships; union statistics deduplicate EntryId.
Ownership denominators include complete 15-player teams only; XI/bench/captain
and vice are distinct. Transfers use consecutive picks and exclude temporary
chip selections from permanent trends. Chips distinguish current round/history.

A source capture conflict for entry1115 SR6 retains central 480/rank1 rather than
Sheet398/rank7; the official public API confirms central values. Historical cohort
membership still uses the stored StandingIndex. The UI says stored standings.
Cumulative elite ancillary totals remain unknown when prior rounds lack values;
no partial total is advertised as a complete season total. API outages may leave
unknown fields. No SR1, free-transfer allowance or score/value estimates invented.

## Acceptance
- 173 regression tests; 11 focused ranking/source/official API tests.
- 39 database, 97 RBAC, 155 HTML-security checks.
- CMS: 16 tests and 26 storage-policy checks.
- Prominents: 8 tests and 21 PostgreSQL checks.
- Production build and git diff --check passed.
- Local browser: 26 checks; all groups, search, historic rounds, manager tabs,
  XI/bench, 1920/1366/820/390; no overflow or browser errors.
- Raw CSV parity verified for all seven Top100 cohorts, XI/ownership/captains;
  the documented central-record conflict is intentional.
- Official SR8 enrichment: 99/99 requested values verified, 100/100 coverage
  including existing central overlap. Cold local API ~8.3s, 180KB JSON; warm cached.
- scripts/test-public-rankings-ui.mjs can repeat browser acceptance against a
  supplied local or production base URL. npm run test:rankings runs endpoint tests.

The security scanner fix recognizes sanitizer-safe static conditional templates;
it does not whitelist files or permit interpolated/dynamic HTML.
No production test account or test record was created. Protected article snapshots
(including 53-block recap and 5 Vooruit) are hash-identical before release.
Production acceptance and deployment identity are reported after deployment.
