# Availability release

## Identity and data policy

Availability is keyed by Studio `payload.id` plus season, never by import row ordinal or fuzzy player name. One effective status is backed by full change history, source proposals and explicit manual overrides. No registered exception is not a medical verification of fitness.

Only active members may read the safe RPC projection. Internal notes and actor IDs are omitted from member responses and history. Management requires both `admin.access` and `availability.manage`; only super_admin receives the new permissions by default. All four private tables have RLS, revoked direct grants and explicit deny policies. Connectors can submit proposals only; accepting a proposal is an explicit authorized action with revision checking.

## Applied migrations (existing project rzunbquzffdivlpuomjc)

- `20261010110119_player_availability.sql`
- `20261010110236_availability_explicit_deny.sql`

The original migration was retained and renamed to its actual applied version. The deny migration originally had local timestamp 20261010110208; its live version is 20261010110236. Do not apply either again.

## Integrations

Admin and Studio availability pages, players list and player details, Mijn selectie, Captain Radar, personal buy/sell advice, analysis and the existing Transfers Live club detail share the availability service. OUT/suspended players are excluded from captain/buy recommendations. Short expected absences protect hold value. Photos use the existing central photo service.

## Validation

Existing successful results: 109 regression tests; 38 isolated availability database checks; 97 admin/RLS checks; 124 platform HTML checks; 29 availability UI checks plus 3 create/edit checks, including widths 390/820/1366/1920.

Release checks: targeted availability and Captain Radar tests pass (including 28 Radar assertions); 15 live API authorization checks pass. A rollback-only transaction verified super_admin writes, safe notes/history projection, manual override preservation, returned status and history. Afterwards production still had 576 players and zero availability statuses/history/sources/proposals. No fictional injuries are published.

Test scripts use isolated PGlite for status fixtures. UI harness requires the existing ignored real-football snapshot `test-results/personal-source.json`; it never sends fixture writes to production. Live acceptance accounts are temporary and removed after browser checks.

## Scope limitations

No external availability feed is connected or approved yet. Source registration and proposal review are ready, but actual connector scheduling requires a verified source. Until real editorial statuses or approved proposals are entered, the UI honestly shows no registered exceptions. No automatic medical assertions or invented injuries are generated.
