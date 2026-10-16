# Speleradvies

Additive `playerAdvice` version-1 article block. Existing articles are never converted. The CMS template supplies ordinary editable intro/conclusion blocks and one advice block.

`playerAdvice.js` reuses Studio `buildAnalysis` purchase scores, `buildDifferentialAnalysis` (ownership <10%, existing quality floor), and the existing xP/price value metric. Budget candidates must have a positive price, expected minutes >=45, fixtures, and a price at/below their position average. Lists contain at most ten eligible candidates; insufficient data is never padded with unsuitable players. Ranking scores remain internal.

`playerAdviceModel.js` validates settings, five unique slots and editorial maps. The selected players and top-ten context are independent JSON snapshots. Refresh replaces only the candidate snapshot. Selected players retain their own round/horizon data until explicitly replaced. Analyses and optional risk notes are keyed by player ID. Manual lookup covers the selected season's complete Studio player catalog and is loaded only on editor request; it is not persisted wholesale.

The renderer reads only saved JSON, never live metrics. It displays one featured player and four alternatives, neutral analysis headings, saved statistics and fixtures. Shared grid rows align the two desktop alternatives per row; tablet/mobile stack. Optional video selection reuses the existing video feed and ordinary article blocks.

Database trigger validation adds the new block to the existing allowlist. No RBAC, publication, registration, analytics or existing article rows are changed. Live test roles must not include articles.publish.

Verification: `npm test`, `npm run test:cms`, database roundtrip/duplicate rejection, existing 5 Vooruit regression, four browser widths, and limited-permission live draft acceptance. The pre-existing `test:security` platform scan flags the literal HTML sink in `src/platform/analyticsConsent.js`; this feature does not modify it.
