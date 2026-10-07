# FVT public homepage — 7 October 2026

The redesign adds a public FVT hub ahead of the existing Studio bootstrap. Auth, database schema, RLS policies, saved-team format and optimizer calculations retain their accepted implementation. The canonical Studio path is now `/studio`, with screens under `/studio/:screen`; old `/players`, `/optimizer`, etc. continue to work. Auth callbacks retain `/auth/callback`, including PKCE and recovery links.

## Routes and components

- `/`: public stadium homepage, working account form or signed-in welcome.
- `/studio`: existing authenticated Studio; visitors see the integrated login.
- `/videos`: real FVT video and channel link.
- `/community`: official YouTube/Instagram links; future forum/subleague explicitly marked unavailable.
- `/about`, `/privacy`, `/contact`: public information pages.
- `/api/latest-video`: fixed-channel YouTube RSS, five-second timeout, 1 MB response bound, validated video identity/date, no user-supplied URLs or secrets. Vercel CDN caches successful responses for 30 minutes; verified fallback for 60 seconds. Fallback is labelled “Uitgelichte video”, not falsely presented as current. No autoplay or embedded player.

`src/public/homepage.js` owns the public shell and scoped CSS. All HTML sinks pass through the existing DOMPurify helper. External titles and profile names are escaped. A new render aborts the previous feed request. Public pages do not initialize football datasets or the optimizer. Profile display name is read through the existing user session/RLS; no email address is published on the homepage.

## Asset provenance

- `public/landing/fvt-logo.png`: resized copy of the existing `public/ui/logo.png`; actual FVT badge, not generated.
- `public/landing/studio-preview.jpg`: real production players screen, captured from accepted release 4180994 on 7 October. Only the test-account toolbar was hidden before capture. Existing FVT logo and real player content preserved; CSS presents a panoramic crop. No invented dashboard/data.
- `public/landing/video-fallback.jpg`: actual YouTube thumbnail for `95hoTNaS6xo`, published 6 October 2026; channel `UCj3NGUiqw1zqEQ-djIu71zQ` / `@FantasyVoetbalTalkEredivisie`.
- `public/landing/stadium.jpg`: generated decorative stadium photograph, with no generated brand or UI. Prompt: premium cinematic photographic football stadium at night, dark navy and cyan lighting, back-facing adult footballer centred around 55%, unbranded jersey number 10, mist and depth, negative space left and right; no text, logos or interface. Optimized JPEG approximately 200 kB.
- Barlow Condensed italic 800: locally hosted Google Fonts font; SIL Open Font License retained in `public/landing/OFL.txt`. Body text uses system fonts; no remote font request.
- The complete landing-image/font set is approximately 534 kB excluding license. No hero video, tracking script or new client framework.

## Validation

Focused tests: `npm run test:public` (routing, canonical/legacy/subpath routes, feed parsing and malformed/oversized/upstream-failure fallback), existing manager persistence / appreciated-squad / optimizer transport tests, and `node scripts/test-platform.mjs` (now includes public HTML sinks). Production build and secret scan required for release.

Browser checks include desktop 1680 and 1366, tablet 820, mobile 390 and 320 pixels; navigation, menu, password visibility, signup/recovery forms, image loading and horizontal overflow. Actual screenshots are retained locally under ignored `test-results/`. Existing comprehensive backend/RLS and optimizer evidence remains in `ACCEPTANCE.md`; it is not replaced by these focused frontend checks.

## Email / operations

Dutch cyan/navy templates are prepared for confirmation, recovery, email change, invitation and optional magic link. Confirmation subject: “Bevestig je account voor Fantasy Voetbal Studio”. Keep `{{ .ConfirmationURL }}` unchanged. The logo uses `{{ .SiteURL }}/landing/fvt-logo.png`; configure Site URL as the origin without a trailing slash. Publish the templates through the existing Supabase email-template settings when configuring verified custom SMTP. The magic-link template does not enable a new login provider or UI.

No Supabase project settings, providers or SMTP credentials were changed by the redesign. Custom SMTP and verified sender configuration remain the external mail-delivery action. Current auth routes and configured callback allowlist remain valid. Vercel serves the existing project, and the release SHA is available at `/release.json`.
