# FVT platform

## Audit and preserved foundation

The profile originally collected raw player club strings, so aliases such as AZ
Alkmaar/AZ, ADO den Haag/ADO Den Haag and N.E.C/N.E.C. became separate choices.
Profile presentation now derives one canonical list from the newest fixture
season. Saved aliases resolve to that list without rewriting historical data.

Home, Videos and Community previously reused the same hero/features/video
composition. The public routes now have separate purposes. `/studio` is the
product landing; `/studio/dashboard` is the authenticated dashboard. Existing
`/studio/selection`, player, captain, history and manager routes remain intact.
The shared seven-link navigation also appears above the internal Studio account
toolbar; leaving Studio flushes pending selection and editorial saves.

Private profiles, fantasy teams, version checks, personal advice, historical
imports and the existing rankings collector are preserved. No history imports,
ranking backfills or optimizer analyses are needed for this release.

## Public sections

- Home: retained FVT hero, newest real video, short Studio introduction, at most
  three published news items, community invitation. No large ranking section.
- Studio: product explanation, real existing product preview, authenticated
  dashboard CTA and links to selection, captain, manager, history and analysis.
- Videos: latest featured episode and the 15 recent entries exposed by the real
  channel RSS feed. Filters use explicit title words only; duration is not
  supplied by that feed. Outages show an explicitly labelled verified fallback.
- News: public overview and slug detail; `/nieuws/beheer` is editor/admin only.
  Plain-text article editing, image URL/description, category, tags, publication
  time, draft/published state, author and related-player links are persisted.
  Updates compare `updated_at` to avoid silently overwriting a concurrent edit.
- Community: seven initial categories, title search/category filtering,
  paginated topics/replies, new topics, replies, owner editing/deletion,
  editor/admin pin/close controls and category creation.
- Existing rankings, about, privacy and contact routes keep the shared shell.

Per the user's explicit decision, no news is published for launch. The empty
news state is intentional. Acceptance uses a private draft; live publication
permissions and latest-three ordering are tested inside a rolled-back database
transaction, so no example article becomes publicly visible.

## Database and security

Applied versioned migrations:

- `20261008084721_fvt_community_news.sql`
- `20261008085050_fvt_content_hardening.sql`

Tables: `forum_categories`, `forum_topics`, `forum_posts`, `news_categories`,
`news_articles`; bounded article tags are stored as a text array. Foreign keys,
author/category/activity/publication indexes and timestamps are included.

Every exposed table explicitly revokes default privileges before granting the
required operations. RLS protects content ownership and editorial access. A
viewer cannot change ownership, author snapshots, creation timestamps or
moderation flags. News drafts and future publications are invisible to anonymous
visitors and ordinary users. Editors/admins derive permissions from the existing
server-owned profile role, never user-editable auth metadata.

Public content stores only the author's display name and user ID. It never joins
or exposes private profile/email data. Profile name edits refresh forum bylines.
Private trigger functions have a fixed search path and revoked direct execution.
The moderation RPC is an invoker wrapper around a private, role-checked helper.

The private rate-limit table serializes inserts per account: at least two seconds
between messages and at most 60 messages per hour. Deleting a message cannot
reset the limit. It has no client grants and an explicit deny policy. Closed
topics reject ordinary-user replies at the database layer. Text is escaped and
all HTML sinks retain the existing DOMPurify protection. Form field names use a
prefix so document properties such as `title`, `body` and `name` cannot clobber
the DOM and are not stripped by sanitization.

Supabase's existing non-blocking advisories remain: the scheduler's `pg_net`
extension is in public, and leaked-password protection is disabled on the current
plan. This release adds no new advisor finding. Reference:
[extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Focused verification

- `node --test src/services/canonicalClubs.test.js scripts/test-public-homepage.mjs`
- `node scripts/test-fvt-database.mjs`: local PostgreSQL ownership, grants,
  public reads, author stamping, rate limit, moderation, drafts/publication and
  existing profile isolation.
- `node scripts/test-platform.mjs`: sanitization and HTML-sink checks.
- `node scripts/test-fvt-live.mjs`: isolated viewer A/B and editor API checks.
  Leaves one private draft for UI acceptance and records its ID only in ignored
  `test-results/fvt-fixtures.json`.
- `node scripts/test-fvt-ui.mjs`: distinct pages, real feed/filter, canonical
  profile saving, existing 15-player team, own topic/reply and edit/search,
  navigation and 1920/1366/820/390 layouts including the open mobile menu.
- `node scripts/test-fvt-editor-ui.mjs`: private draft edit/reload, preview,
  plain-text XSS handling and responsive article/editor.
- `scripts/test-personal-ui.mjs`: selection/profile and real logout/login
  regression after the dashboard route change.
- `npm run build` and live `/release.json` versus canonical GitHub main.

UI tests use an isolated browser and the existing dedicated acceptance accounts.
Set `FVT_ORIGIN`/`FVT_SESSION` (and `FVT_EDITOR_SESSION`) for production runs.
Never commit test credentials, environment files or browser state. Remove only
the recorded private draft and the isolated account's explicitly labelled
acceptance topics after verification. Keep production news empty until FVT
provides real editorial content.
