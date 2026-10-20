# KNVB context + Dreamteam

KNVB_FIXTURES: existing published CSV, gid 319573905. Reads only Ronde, Datum, Tijd, Thuisclub, Uitclub. Dates use Europe/Amsterdam through the existing kickoff parser. Season comes from the July-June date. Internal identity uses season/round/exact normalized home/away, stable through time changes and sorting. Invalid/duplicate rows are logged and skipped. No Sheet writes, Apps Script, import tab or new scheduler.

26 manual rows verified; 11 relevant fixtures / 12 canonical club views. Exact central club aliases only. Context is stored in existing european_fixtures, never fixtures/results/player_match_stats. KNVB adds schedule/5 Vooruit/advice context; league matches and schema values unchanged. Status is intentionally unknown: the five-column Sheet does not provide match status or scores. Existing article snapshots change only after explicit editorial preparation.

Dreamteam is an additive CMS block: existing solver and pitch, best legal XI (max three per club, no price cap), week-player tie break points/minutes/name, manual player and week-player overrides, editable line/player analyses, notable players, independent optional 5%/10% differential XI, existing video selection. Snapshots persist; rendering does not regenerate. Existing hero, intro, conclusion and CTA blocks remain editable.

Local validation: 176 regression tests; 18 reference pipeline tests; 16 CMS tests + 26 Storage checks; database/RLS/security suites; isolated Dreamteam SQL roundtrip and duplicate rejection. Current browser harness: editor serialize/reload identical; standard + differential 22 players; 1920/1366/820/390 no overflow or browser errors. Production build and diff check pass. No production test article/account was created.

Legacy Apps Script files were archived in ignored test-results/dreamteam-knvb/obsolete-apps-script. They are not part of the app or release. If previously installed, remove only the syncKnvbFixtures trigger in Google Apps Script.
