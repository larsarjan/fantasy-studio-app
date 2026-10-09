# FVT Admin Center — eindrapport 9 oktober 2026

Live: https://fantasyvoetbaltalk.nl/admin. Deployment `dpl_j3uZbWBiAFvXKgDRrpPssyBhwSNC`, READY, bestaande Vercel `fantasy-studio-app`. Publiek `/release.json` bevestigt codecommit `7cc095010b3be731eb114abb7cd5b51271428c76`. GitHub main en releasebranch bevatten die code. De laatste documentatiecommit voegt dit rapport toe en stemt migratiebestandsnamen af op de daadwerkelijk toegepaste Supabase-history; de gedeployde frontendcode verandert daardoor niet.

| # | Onderdeel | Resultaat |
| --- | --- | --- |
| 1 | Auth/rollen vóór wijziging | Supabase Auth + eigenaren-RLS, profiles.role viewer/editor/admin; editor had te brede publicatie/moderatierechten. Inspectie vóór bouwen in ADMIN-ARCHITECTURE.md. |
| 2 | Nieuw rollenmodel | member, moderator, editor, publisher, admin, super_admin; meerdere rollen en union van permissions. Bestaande admin/editor behouden, viewer -> member. |
| 3 | Permissionmatrix | Alle 32 permissions met zes rollen volledig opgenomen in ADMIN-RELEASE.md. Database is bron van waarheid; metadata is geen autorisatiebron. |
| 4 | Tabellen/migraties | roles, permissions, role_permissions, user_roles, site_features, site_videos, admin_audit_log; compatibele uitbreidingen van profiles/news/forum. Live migraties `20261009151732_fvt_admin_center.sql` en `20261009152258_admin_sync_action_boundaries.sql`. Fotomigratiebestandsnaam ook afgestemd op bestaande live history `20261009090027_central_player_photos.sql`, zonder SQL-wijziging. |
| 5 | RLS/backend | Alle publieke tabellen RLS; protected role/status-RPC, publicationtriggers, forum-RPC, restrictieve visibilitypolicies, column grants, getUser + actuele permissions in beide sync-Edge Functions. Live: 0 onbeschermde publieke tabellen. |
| 6 | Routes | /admin, dashboard, nieuws, videos, community, users, features, studio, input, data, photos, sync, audit, system. Login via bestaande auth, expliciete 403 voor verkeerde rol/subroute. |
| 7 | Live secties | Dashboard, nieuws, video's, community, gebruikers, features/Studio, interne invoer, data, spelersfoto's, sync, audit, systeemsamenvatting. Browser renderchecks geslaagd voor alle acht belangrijkste beheersecties. |
| 8 | Interne tools | /nieuws/beheer -> /admin/nieuws; /studio/input -> /admin/input. Geen invoer/syncknoppen in normale Studio-navigatie. Moderatie- en categoriebeheer niet meer op publieke community; ranglijstensyncbeheer naar /admin/sync. Persoonlijke selectie/import/notities behouden. |
| 9 | Featurevisibility | public/member/staff/admin/hidden, aan/uit, permission, onderhoudsbericht; route- én data/API-afscherming. Interne tools mogen niet publiek gemaakt worden. Geen deploy voor visibilitywijzigingen. |
| 10 | Nieuws | Zoeken/paginatie, zes statussen, draft/edit/preview, publicatie/depublicatie, featured, auteur/editor/publisher, categorie, afbeelding, bevestigde delete. Live create/edit/schedule/publish/unpublish/delete en forbidden editorpublish getest. |
| 11 | Video's | Centrale YouTube-classificatie hergebruikt; CMS voor URL/ID/titel/rubriek/thumbnail/featured/zichtbaarheid/datum/sortering boven bestaande feed. Live API levert 15 echte afleveringen. Hidden CMS-video onderdrukt feed-ID. |
| 12 | Community | Topic/categoriefilter, paginatie, pin/lock, hide/show/delete, reden, categoriewijziging, usercontext, categorie toevoegen. Live moderatorpin/lock/hide en directe hidden REST-read getest. |
| 13 | Users/rollen | Private profieldirectory, rollen, status en permissionpreview; bevestigde serverbeveiligde wijziging. Live multi-role union, self-promotion, critical-rolegrenzen en stale-JWT block getest. Geen authsecrets/sessies/wachtwoorden zichtbaar. |
| 14 | Foto's | Bestaande centrale service/manifest/player_photos; naam/club/ID-zoeken, bron/status/lokale fallback, override toevoegen/verwijderen. Ook spelers zonder registryrij worden gevonden. Concurrency en source-columnbescherming getest. |
| 15 | Sync/data | Bestaande Sheets-import en reference_imports, ESPN-syncstatus/errors/retries, veilige begrensde handmatige sync. Geen nieuwe scraper. Prijs-sync/calibratie/import/retention backend ook op actuele permissions; calibratie/retention super_admin. |
| 16 | Audit | Append-only log, actor/action/target/allowlisted metadata/timestamp; uitsluitend audit.view reads. Content-, foto-, feature-, rol-, status- en syncacties gelogd. Directe insert/update/delete geweigerd, ook admin. |
| 17 | Securitytests | 97 lokale admin-PG/RLS-checks; 38 bestaande data/persistentiechecks; 105 platformchecks; 58 echte live Auth/REST/RPC/Edge Function-checks. Secret/service-role-scan: 1932 bestanden, 0 bevindingen. |
| 18 | Browsertests | 31 lokale volledige UI-flows met real PostgreSQL-RLS; 29 live productiechecks met echte Supabase-login voor alle zes rollen. De aanvankelijk ambigue directoryjoin is gevonden, expliciet gemaakt en met live regressietest + herhaalde browsercontrole geverifieerd. |
| 19 | Responsive/toegankelijkheid | 1920, 1366, 820, 390 lokaal én productie zonder dashboardoverflow. Mobiele drawer, Escape, labels, focusstates, semantische buttons en dialogbevestigingen. Screenshots visueel bekeken op desktop/mobiel. |
| 20 | Build/regressie | Lokale en Vercel-build geslaagd. 89 bestaande moduletests, 24 contentchecks, 21 prominentendatabasechecks, 11 foto-RLS-checks en 3 publieke routing/feedtests geslaagd. Geen nieuwe runtime-errorlogs gevonden voor de geteste deployments. |
| 21 | Commit | Gedeployde code `7cc095010b3be731eb114abb7cd5b51271428c76`; voorgaande implementatie `80bee1f`, sync-hardening `2ba674c`, live-testcoverage `dff19ca`. Main is zonder force-push vooruitgezet. |
| 22 | Productie | https://fantasyvoetbaltalk.nl/admin; www en bestaande projectaliases blijven bij hetzelfde project. Vercel en Supabase projectidentiteit geverifieerd. Geen nieuw project. |
| 23 | Resterende grenzen | Geen echte super_admin aangewezen zonder eigenaarverificatie; bootstrapinstructie in ADMIN-RELEASE.md. E-mail/last_sign_in niet naar UI gekopieerd. Geen nieuw reports/appeals-systeem, generieke DB-editor of providercredential-editor. Bestaande invoer is een Sheets-exportgenerator. Onderhoudstekst wordt opgeslagen; denied route toont generieke 403. |

## Opruiming en behoud

Zes tijdelijke echte acceptatieaccounts zijn verwijderd uit auth.users, met bijbehorende profielen/rollen/sessies. Verificatie: 0 resterende testaccounts. Tijdelijke nieuwsartikelen/topics/reacties verwijderd; eindstand 0 artikelen, 0 topics, 0 reacties, overeenkomstig de inventarisatie. Bestaande 8 profielen en 576 spelers behouden. Permanente rolstand: 6 member, 1 editor, 1 admin; 0 echte super_admin. Lokale tijdelijke wachtwoordbestanden en bootstrap-SQL verwijderd. 44 auditrecords blijven bewust als niet-verwijderbaar bewijs van gecontroleerde testacties; verwijderde testactors zijn null, zonder wachtwoorden/tokens/contentbodies in metadata.

## Bestaande advisorwaarschuwingen

Deze twee waarschuwingen waren aanwezig vóór de release en zijn niet geïntroduceerd door het Admin Center: [pg_net in public schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) en [wachtwoordlekcontrole uitgeschakeld](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). De eerdere INFO-meldingen voor server-only pricetabellen zonder policy zijn verdwenen na de restrictieve policies. Geen nieuwe security-advisorbevindingen door de adminmigraties.

## Bewijsbestanden

Lokaal, niet gedeployd of gecommit: `test-results/admin/browser-results.json`, `test-results/admin-live/api-results.json`, `test-results/admin-live/browser-results.json`; screenshots in dezelfde mappen. Volledige architectuur, permissionmatrix, rollbacknotities en eerste-super-admin-instructie in ADMIN-ARCHITECTURE.md en ADMIN-RELEASE.md.
