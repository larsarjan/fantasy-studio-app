# Google Sheets cloud publication fix

The import previously swallowed publication errors and the Admin action unconditionally reported success. A missing client permission also silently returned false. Successful local normalization therefore did not prove cloud publication.

Publication now refreshes permissions, requires data.correct and sync.run, propagates the RPC code/message, and verifies the returned Google Sheets import UUID, server timestamp and all sixteen counts. Synchronization returns that receipt, caches only after confirmation, and restores its prior local snapshot on failure. Configured source-sheet failures abort rather than publish a partial dataset. The existing transactional publication RPC and its safety checks are unchanged.

Live acceptance on 2026-10-11 used one temporary member with only data.correct and sync.run. No admin, super_admin, admin.access or user-management permission was granted. After publication the temporary role/permissions were removed; member cloud reading succeeded and member publication was denied.

Real import: 1e00fcd5-58ce-4b36-b3b4-2c96209ae47b, 2026-10-11T16:26:24.606811Z. RPC HTTP 200; the historical RPC failure did not recur and its original code is unknown. An intentional invalid-dataset request returned P0001 and left the import ID and hashes of all sixteen complete datasets unchanged.

Counts: players 578; historical players 513; fixtures 306; European fixtures 44; ratings 18; results 4281; metadata 591; player match stats 4439; elite player stats 8890; elite transfers 5997; elite control 1418; chip usage 247; elite formations 0; elite club exposure 971; disabled transfer datasets 0 each.

Round 8 correctly remains Lopend (8/9 matches); Excelsior–FC Groningen is still in progress. Round 8 includes 518 match-stat records, 242 with positive minutes. No result or round was invented.

Validation: 9 publication/rollback/error tests; 109 existing regressions; 97 admin/RLS and 124 HTML security checks; isolated full real-candidate database publication and rollback; build and diff checks. User-management work in progress is excluded from this release.
