# Source audit — 2026-10-05

The supplied `C:/Users/Lars/Desktop/fantasy-studio.zip` was compared by SHA-256 with the working tree: all 462 files under src, electron and docs match. The working tree includes uncommitted changes predating this migration; preserve them. Existing origin is larsarjan/fantasy-studio, requested canonical target is larsarjan/fantasy-studio-app.

## Architecture before migration

Vanilla JavaScript ES modules, Vite 8, template-string DOM rendering (not React). Electron only hosts the built static files on loopback; no renderer IPC or Node integration. Domain algorithms already separated into services. `main.js` owns navigation; no URL routing. Worker-based manager optimizer, browser OCR using Tesseract, clipboard text and screenshot team imports. Google Sheets published CSVs are the live reference source. Apps Script integrations are preserved under docs/apps-script.

## Feature regression inventory

| Existing screen/feature | Source | Before | Migration/verification |
|---|---|---|---|
| Dashboard, summaries, intelligence | modules/dashboard.js | Present | Pending |
| Player database, profiles, filters, images, expected lineup | modules/players.js | Present | Pending |
| Player comparison and outlook | modules/compare.js, compareOutlook.js | Present | Pending |
| Fixtures, club difficulty, European competition context | modules/fixtures.js | Present | Pending |
| Historical player/team data | modules/history.js | Present | Pending |
| Analysis and editorial intelligence | modules/analysis.js, intelligenceUi.js | Present | Pending |
| Captain Radar | modules/captainRadar.js | Present | Pending |
| Differentials | modules/differentials.js | Present | Pending |
| FVT Manager, team text/screenshot imports, lineup, transfers, season/chip planning | modules/optimizer.js, services/optimizer, workers | Present | Pending |
| Dream Team | modules/dreamteam.js | Present | Pending |
| Match-stat round generator and clipboard TSV export | modules/input.js | Present | Pending |
| Transfer Deadline Live, editorial changes, Apps Script sync | modules/transferDeadlineLive.js | Present but feature flag OFF in supplied source | Preserve flag and implementation |
| Settings | main.js | Coming-soon placeholder | Replace with working account/preferences/import |

## Data and persistence

`database.js` owns players, historicalPlayers, fixtures, europeanFixtures, teamRatings, results, playerMetadata, playerMatchStats, elitePlayerStats, eliteTransfers, eliteSyncControl, chipUsage, eliteFormations, eliteClubExposure, transferDeadline, transferClubOverview. Derived profiles, scores, intelligence and optimizer projections are computed, not independent canonical records.

`databaseStorage.js`: IndexedDB fantasy-studio-storage/cache keys database and syncStatus. This is reference-data cache, not a private user database. Player module localStorage fantasy-profile-v1 is a recomputable score cache. Transfer editorial service stores editorial records, club assessments, local transfers, session start, synchronization queue/config/status in localStorage. Shared config can contain an Apps Script bearer token and must never become public/shared data. No sessionStorage usage. Manager team/settings currently live only in module memory and are lost on reload; new cloud persistence must include them.

Ephemeral filters, selected rows, modal state, progress, analysis results and optimizer search state should remain ephemeral. Preserve browser cache as cache, with cloud as authority for private records. Legacy data import must be explicit and nondestructive.

## Baseline evidence

- `npm.cmd run build`: passed, existing >500 kB intelligence chunk warning.
- Node test runner: 25 test files, 24 passed, 1 failed.
- Failure: optimizerChipStrategy.test.js:108 expects 8 scheduled chips, gets 4. Squad-chip candidate seeds are computed but never evaluated/added to scores; investigate implementation.
- Two real-data inspector scripts print empty projections while passing; these are diagnostics, not substantive coverage.
- src/assets/Players/20260288.webp contains HTML, not an image (1.75 MB).
- Initial database is empty on a fresh browser except European fixtures; initial full reference load needed.
- Heavy use of innerHTML requires centralized sanitization plus safe text/attribute handling.
- No existing auth, RLS, cloud user persistence, deployment config or unified test command.

## Acceptance status

Not complete. Live infrastructure, auth, persistence, security, browser regression and deployment must be verified before declaring delivery.
