# Scenario B price retention

The existing hourly `fantasy-studio-prices-retention` job (`15 * * * *`) calls
`price_retention()`. The production control is enabled. No new scheduler is used.

Raw observations retain 72 hours, daily last observations per player, both sides
of feature changes, 01:30–03:00 UTC update windows, event timestamps, and the
24 hours before / 6 hours after each price event. Forecasts retain 72 hours,
daily controls, event-linked forecasts and direction/pressure boundary changes.
Each invocation moves at most 20,000 rows of each kind atomically into private
per-player/day JSON archives. All original measurement timestamps (including
microseconds) and complete forecast JSON survive. The collector reads the
security-invoker `price_replay_snapshots` view for catch-up replay. Archives have
no current-player foreign key: historical players must survive roster changes.

Migration files are applied once through the migration ledger. Retention is
repeatable, uses the collector advisory lock, and rolls back deletion if archive
insertion fails. Public and authenticated access to archives is denied.

## Production verification, 23 October 2026

Baseline cutoff: `2026-10-23 10:00:03.956+00`.

| Measure | Before | After initial batch drain |
| --- | ---: | ---: |
| Raw predictions | 175,075 | 86,347 |
| Raw snapshots | 633,926 | 318,746 |
| Archived forecasts | 0 | 88,728 |
| Archived observations | 0 | 315,785 |
| Database bytes | 628,209,331 | 661,460,659 |

The collector added 605 snapshots during cleanup. Reconstructed observations
through the cutoff contain exactly 633,926 rows; reconstructed forecasts contain
exactly 175,075 rows. Both whole-row checksum sums match the baseline. All 365
current events, including the original 357, retain the same ordered JSON hash.
Fifteen event reset timestamps already lacked raw snapshots before cleanup;
their complete reset observations remain embedded in the unchanged event JSON.

Physical totals including indexes/TOAST: predictions 379,609,088 bytes;
snapshots 168,370,176; observation coverage 21,700,608; forecast archive
11,223,040; retention checkpoint 376,832. DELETE makes old space reusable but
does not promise file shrinkage. No VACUUM FULL or pg_repack was executed.
Physical reclaim requires a separately reviewed maintenance operation; the
under-500 MB target is not yet achieved. Lossless archives and daily/event
controls still grow over time; this policy does not impose a fixed disk cap.

Validation: retention/replay equivalence, full forecast JSON, microseconds,
rollback, repeatability and role isolation tests; 21 database checks; 178
regression tests; security suites (39 + 97 + 155); production build passed.
The live collector continues updating a 605-player cache and 87 evaluations.
Visual authenticated browser acceptance remains pending: no browser surface
was available. No new test account was created while that prerequisite was
missing. This document does not claim a completed frontend release.
