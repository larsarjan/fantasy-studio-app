# KNVB context + Dreamteam

KNVB_FIXTURES: existing published CSV, gid 319573905. Reads only Ronde, Datum, Tijd, Thuisclub, Uitclub. Dates use Europe/Amsterdam through the existing kickoff parser. Season comes from the July-June date. Internal identity uses season/round/exact normalized home/away, stable through time changes and sorting. Invalid/duplicate rows are logged and skipped. No Sheet writes, Apps Script, import tab or new scheduler.

26 manual rows verified; 11 relevant fixtures / 12 canonical club views. Exact central club aliases only. Context is stored in existing european_fixtures, never fixtures/results/player_match_stats. KNVB adds schedule/5 Vooruit/advice context; league matches and schema values unchanged. Status is intentionally unknown: the five-column Sheet does not provide match status or scores. Existing article snapshots change only after explicit editorial preparation.

Dreamteam is an additive CMS block: existing solver and pitch, best legal XI (max three per club, no price cap), week-player tie break points/minutes/name, manual player and week-player overrides, editable line/player analyses, notable players, independent optional 5%/10% differential XI, existing video selection. Snapshots persist; rendering does not regenerate. Existing hero, intro, conclusion and CTA blocks remain editable.

Local validation: 176 regression tests; 18 reference pipeline tests; 16 CMS tests + 26 Storage checks; database/RLS/security suites; isolated Dreamteam SQL roundtrip and duplicate rejection. Current browser harness: editor serialize/reload identical; standard + differential 22 players; 1920/1366/820/390 no overflow or browser errors. Production build and diff check pass. No production test article/account was created.

Legacy Apps Script files were archived in ignored test-results/dreamteam-knvb/obsolete-apps-script. They are not part of the app or release. If previously installed, remove only the syncKnvbFixtures trigger in Google Apps Script.

Final acceptance: live Studio FC Utrecht/Kozakken Boys context and new unsaved 5 Vooruit preparation passed. Dreamteam + separate 10% differential snapshot saved/reloaded in temporary draft; free keeper analysis persisted. Publish denied 403, duplicate XI denied 400, rejected writes left snapshot intact. Test account, draft, profile, sessions and temporary role/permissions deleted; SQL counts zero.

Presentation fixes: Dreamteam stylesheet loaded in CMS/public articles, narrow pitch cards fit all 22 players, analysis contrast explicit. KNVB labels use KNVB Beker with one badge. Logo matches supplied 400x400 image; local asset copied from https://pbs.twimg.com/profile_images/1100735945916248064/hFs16Vt6_400x400.png (official KNVB Beker profile); no external image request at runtime. Existing source/import/scoring architecture unchanged.

A pre-existing draft was edited by its existing editor during acceptance (audit 2026-10-20T14:53:09Z, not the test account). Its current content hash is 9b2f4ecbc391159482d649b39d76a964. Other six content hashes remain unchanged, including the protected 53-block article. No existing article was a test mutation target.
