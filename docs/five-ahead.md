# 5 Vooruit

New article entry: Admin → Nieuws → + 5 Vooruit. Choose season, starting round and one of the six existing Studio presets. Prepare the data explicitly, write the intro and three club analyses, edit the summary, select a real video, preview and save/publish through existing CMS permissions.

`fiveAhead` is an optional version-1 content block. Existing article JSON is never converted. Prepared data is an editorial snapshot: reader category changes select saved club data; only the editor's prepare action refreshes it. Club texts survive refreshes. Horizon is five league fixtures, with other competitions inside the shared round window shown as secondary context. No automated opinion or publication.

Shared services: clubGroups (extracted unchanged from Studio), clubSchedule (existing difficulty/schema calculation), fixtureWindows, difficultyEngine, clubLogos, europeanFixtureContext and the existing video feed. Existing Studio functions delegate to the extracted calculations.

The database migration only extends validation; it does not update articles or change grants. Drafts can be unfinished; publication requires prepared five-match schedules. The editor uses existing authenticated reference-data access; public rendering requires no new privileged endpoint or credentials.

Acceptance data: round 9–13, PSV/Feyenoord/Ajax, from the 2026-10-15 cloud snapshot. Schema values 1.72 / 1.92 / 2.00. Values remain independent of context matches. Local browser widths: 1920, 1366, 820, 390. Live checks and temporary-account cleanup are recorded in ignored test-results/five-ahead.
