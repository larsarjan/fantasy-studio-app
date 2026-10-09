# Account security

## Self-service deletion

Profile and Account settings share the destructive account section. The user types `VERWIJDER`. `POST /functions/v1/delete-account` accepts only this confirmation, never a target user ID. The Edge Function verifies the bearer token with Auth and checks its live `auth.sessions` record. Only server credentials can invoke the deletion RPCs. The last administrator cannot delete their account before transferring management.

The service claims a renewable deletion job, preserves shared editorial assets, deletes owned personal Storage objects through the Storage API, revokes all sessions, then hard-deletes the Auth user. A three-minute job lease prevents concurrent deletion requests. Failures are retryable after reauthentication; already-deleted files cannot be restored. Audit events contain an opaque request ID and stage, not credentials, email or message bodies.

### Data policy

- Auth user, profile, preferences, selections, saved versions/plans, private notes and role assignments follow their existing CASCADE foreign keys.
- Owned personal Storage objects are removed. Shared `news-images` assets remain physically present with owner references cleared, so published articles retain their images.
- Public topics and replies retain IDs, bodies, timestamps and replies by other users. Their author reference becomes NULL and the visible name becomes **Verwijderd account**. Users are told to remove personal information from public message bodies beforehand.
- Editorial articles remain with the generic **FVT-redactie** attribution. Author/editor/publisher and configuration-updater references become NULL. Existing security audit records remain under the existing audit policy; no new message bodies or secrets are logged.
- Foreign-key updates have narrow trigger exceptions. Existing RBAC checks, RLS and ordinary write guards are retained.

## Turnstile activation (pending real widget configuration)

The frontend integration is present but defaults OFF. Signup and password recovery pass `captchaToken` to Supabase Auth. Expired tokens, unavailable scripts and verification failures disable submission and show Dutch messages. Email confirmation/recovery redirects are unchanged. No-JS visitors receive an explanation.

Native Supabase Auth CAPTCHA also validates password login. It cannot be switched on for signup/recovery while leaving native password login unprotected. Production activation therefore requires the product owner's decision on login in addition to the real widget keys. Do not claim protection while the native setting is off.

1. Configure a Cloudflare Turnstile widget for the production hostname(s).
2. Set public Vercel production variables `VITE_TURNSTILE_SITE_KEY`, `VITE_AUTH_CAPTCHA_ENABLED=true`, and (after approval) `VITE_AUTH_CAPTCHA_LOGIN=true`. The build rejects dummy keys and incompatible flags.
3. Put the matching secret **only** in Supabase Auth → Bot and Abuse Protection → CAPTCHA (Turnstile). Do not prefix it with VITE, commit it, or send it to the browser.
4. Coordinate frontend release and native CAPTCHA activation. Do not enable native enforcement before the login widget is available.
5. Verify valid signup/recovery/login and reject direct missing/invalid-token calls against Auth. These live CAPTCHA acceptance checks remain pending until activation.

References: [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Auth route enforcement](https://github.com/supabase/auth/blob/master/internal/api/api.go), [Cloudflare test widgets](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## Verification

- `npm test` covers service failures, token expiry/reset and actual form token/redirect wiring.
- `node scripts/test-account-deletion-database.mjs` checks cascades, public-content preservation, ownership, last-admin protection and RPC permissions in isolated PostgreSQL.
- `node scripts/test-admin-database.mjs` retains Admin Center/RLS regression coverage.
- `scripts/test-account-security-live.mjs` provides prepare/api/cleanup modes for isolated live member fixtures. Credentials stay in ignored `test-results`; always run cleanup. No public test content is created.
- `scripts/test-account-deletion-ui.mjs` tests confirmation, network failure/retry, responsive layout and actual deletion/logout using the disposable UI account. `SECURITY_ORIGIN` selects local or production.
- `scripts/test-captcha-ui.mjs` targets a local Vite instance on port 5182 with the official Cloudflare test sitekey. It checks desktop/tablet/mobile, blocked scripts and actual browser JavaScript disabling. It sends no signup/reset requests and does not prove native production enforcement.
