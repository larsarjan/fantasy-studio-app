# FVT Admin Center — release en beheer

## Architectuur en compatibiliteit

Zie ADMIN-ARCHITECTURE.md voor de inspectie vóór wijzigingen en het expliciete rapport van interne tools. Productie: Vite/vanilla JS, Supabase Auth en PostgreSQL RLS, Vercel `fantasy-studio-app`, domein `fantasyvoetbaltalk.nl`, Supabase `rzunbquzffdivlpuomjc` (Fantasy Studio). Geen nieuw hostingproject of authsysteem. Persoonlijke selecties, voorkeuren, forumcontent, voetbalreferenties, Price Predictor en historische ranglijsten worden behouden.

Oud: profiles.role viewer/editor/admin; beschermde profielkolommen, maar editor kon nieuws publiceren, community modereren en referentiedata importeren. Nieuw: relationele roles/permissions/role_permissions/user_roles, union van meerdere rollen, actuele permissionchecks vanuit de database. Viewer migreert naar member. Bestaande editor/admin blijven dezelfde rol houden, met de hieronder expliciet beperktere editorrechten. profiles.role blijft een alleen serverbeheerbare compatibiliteitsweergave; geen autorisatiebron. User metadata wordt niet gebruikt.

## Volledige permissionmatrix

✓ toegestaan, — niet toegestaan. SQL is de bron van waarheid; frontend krijgt geen beveiligingspresets.

| Permission | member | moderator | editor | publisher | admin | super_admin |
| --- | --- | --- | --- | --- | --- | --- |
| admin.access | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| articles.read | — | — | ✓ | ✓ | ✓ | ✓ |
| articles.create | — | — | ✓ | ✓ | ✓ | ✓ |
| articles.edit | — | — | ✓ | ✓ | ✓ | ✓ |
| articles.publish | — | — | — | ✓ | ✓ | ✓ |
| articles.unpublish | — | — | — | ✓ | ✓ | ✓ |
| articles.delete | — | — | — | — | ✓ | ✓ |
| videos.read | — | — | — | — | ✓ | ✓ |
| videos.create | — | — | — | — | ✓ | ✓ |
| videos.edit | — | — | — | — | ✓ | ✓ |
| videos.publish | — | — | — | — | ✓ | ✓ |
| videos.hide | — | — | — | — | ✓ | ✓ |
| videos.delete | — | — | — | — | ✓ | ✓ |
| forum.moderate | — | ✓ | — | — | ✓ | ✓ |
| forum.pin | — | ✓ | — | — | ✓ | ✓ |
| forum.lock | — | ✓ | — | — | ✓ | ✓ |
| forum.delete | — | ✓ | — | — | ✓ | ✓ |
| forum.manage_categories | — | ✓ | — | — | ✓ | ✓ |
| users.view | — | — | — | — | ✓ | ✓ |
| users.manage_status | — | — | — | — | ✓ | ✓ |
| users.manage_roles | — | — | — | — | ✓ | ✓ |
| features.view | — | — | — | — | ✓ | ✓ |
| features.manage | — | — | — | — | ✓ | ✓ |
| data.view | — | — | — | — | ✓ | ✓ |
| data.correct | — | — | — | — | ✓ | ✓ |
| sync.view | — | — | — | — | ✓ | ✓ |
| sync.run | — | — | — | — | ✓ | ✓ |
| player_photos.view | — | — | — | — | ✓ | ✓ |
| player_photos.manage | — | — | — | — | ✓ | ✓ |
| system.view | — | — | — | — | ✓ | ✓ |
| system.manage | — | — | — | — | — | ✓ |
| audit.view | — | — | — | — | ✓ | ✓ |

Admin kan lagere rollen wijzigen, niet zichzelf en niet een gebruiker met admin/super_admin. Alleen een actieve super_admin kan adminrollen beheren. Zelfwijziging is voor elke rol verboden. Globale transactionele lock voorkomt gelijktijdige kritieke rol/statuswijzigingen. De laatste actieve super_admin mag niet verdwijnen of geblokkeerd worden. Een geblokkeerd account verliest direct beheerpermissions en accountwrites, ook met een eerder uitgegeven JWT. Supabase-sessies worden niet getoond.

## Database, RLS en RPC

Migratie: `20261009142245_fvt_admin_center.sql`; additive, lokaal tweemaal getest. Nieuwe tabellen: roles, permissions, role_permissions, user_roles, site_features, site_videos, admin_audit_log. Bestaande profiles krijgt account_status; nieuws krijgt zes statussen, featured, last_editor_id en published_by; topics/posts krijgen hidden. Geen productiecontent verwijderd. Seeds gebruiken bestaande user_id's uit profiles, geen vastgelegde generated IDs.

Nieuwe tabellen hebben expliciete grants en RLS. Relationele rol/mappingtables zijn niet client-schrijfbaar. Rol/status-RPC's controleren actor, permission, doel, nieuwe rollen, reden en privilegegrenzen. Audit is uitsluitend appendbaar door interne serverfuncties, leesbaar met audit.view; geen client INSERT/UPDATE/DELETE. Auditmetadata is een allowlist; geen e-mails, contentbodies, sessies of secrets.

Artikeltrigger controleert INSERT én UPDATE, status, featured, publicatiemoment en auteur. Editor kan bestaande gepubliceerde artikelen niet rechtstreeks wijzigen, zodat live content niet via een bodyupdate kan worden gepubliceerd. Publisher kan publiceren/depubliceren; DELETE vereist aparte permission. Scheduled content wordt leesbaar vanaf published_at, zonder een nieuwe scheduler; publieke queries ondersteunen scheduled en published.

Forum behield eigenaar-writes, rate limiting en gesloten-topicchecks. Moderatie-RPC's controleren individuele pin/lock/delete/categorypermissions. Verborgen topics/reacties en reacties onder verborgen topics zijn server-side afgeschermd. Redactie heeft geen moderatiepermission meer. Eigen normale gebruikersacties blijven publiek; dagelijks moderatiebeheer verhuisde naar /admin/community.

Featurevisibility wordt op route én data gecontroleerd: price-datasets/rankings hebben restrictieve RLS, artikelen en forum hebben visibilitychecks, video-API voert dezelfde databasecheck uit. Interne invoer kan niet publiek gemaakt worden. Features met system.manage vereisen super_admin om de instellingen te wijzigen. Publieke menu's en homecontent respecteren visibility; geen vaste videofallback die een verborgen CMS-video terugzet. Gedeelde spelers/fixtures zijn input voor verschillende consumentenmodules en blijven beschikbaar voor toegankelijke Studio-analyses; geen extra module-specifiek API-endpoint bestaat voor captain/differentials/dreamteam.

## Routes en secties

/admin en /admin/dashboard, /admin/nieuws, /admin/videos, /admin/community, /admin/users, /admin/features, /admin/studio, /admin/input, /admin/data, /admin/photos, /admin/sync, /admin/audit, /admin/system. Niet ingelogd: bestaande Supabase-login, bestemming blijft /admin. Ingelogd zonder juiste permission: expliciete 403-pagina. Subroutes hebben eigen permissionguards. Adminmodule wordt apart geladen (ongeveer 10 kB gzip), geen admin-datasets in de publieke initialisatie.

Nieuws: zoeken, paginatie, statusfilters, concept/review/gepland/gepubliceerd/verborgen/gearchiveerd, title/slug/intro/body/image/category, auteur/editor/publicatie-informatie, featured, voorbeeld, bevestigde publicatie/depublicatie/verwijdering. Bestaande /nieuws/beheer leidt door naar /admin/nieuws. Categorieselectie hergebruikt news_categories.

Video's: YouTube URL/ID-validatie, centrale videoCategory-regels, titel, rubriek, thumbnail, beschrijving, featured, zichtbaar/verborgen, datum en sortering. site_videos is de CMS-laag boven de bestaande echte YouTube-feed. Verborgen CMS-ID's onderdrukken feedvideos; verwijderen van een registratie kan de automatische feed weer zichtbaar maken. De API gebruikt uitsluitend publishable key + gebruikers-JWT, geen service-role; response is no-store om visibility meteen te respecteren.

Community: zoeken/categoriefilter, topics, gepagineerde reacties, pin/lock, hide/show/delete, categorywijziging, redenen, auteur/user-idcontext, categorie toevoegen. Er is geen bestaande reports/moderation-queue-tabel; geen nep-aantallen voor meldingen.

Gebruikers: weergavenaam, club, rollen, status, registratiedatum, volledige permissiepreview en bevestigde multi-rolewijziging/blokkering. E-mail en last_sign_in worden bewust niet uit auth.users naar de UI gekopieerd; niet beschikbaar op deze pagina. Geen wachtwoorden, tokens of sessies.

Features/Studio: centrale site_features voor prijsvoorspelling, captain, differentials, dreamteam, rankings, community, nieuws, video's en interne/experimentele tools. enabled, public/member/staff/admin/hidden, required_permission, onderhoudsbericht. Veranderingen vereisen geen deploy; serverchecks zijn actueel, menu's worden bij paginaladen opgebouwd. Onderhoudsbericht is opgeslagen; afgeschermde route toont generieke 403.

Foto's: naam/club/ID-zoekfunctie vanuit bestaande players; bestaande player_photos en centrale fotoservice/manifest bepalen bron/lokale fallback. Override kan ook bij ontbrekende registratierij gemaakt/verwijderd worden via permission- en concurrencygecontroleerde RPC. Automatische bronvelden kunnen admins niet direct wijzigen.

Data/sync: reference_imports-counts/timestamps; bestaande Google Sheets-import; recente ESPN-runs/errors/retries; begrensde handmatige prominent-sync. Geen nieuwe scraper. Edge Function valideert JWT met getUser en actuele sync.run, logt start, behoudt schedulerauth. Data-invoer is de bestaande exportgenerator; geen nieuwe willekeurige database-editor. Er bestaat geen afzonderlijk overzicht van laatste price-sync-run; geen verzonnen status. /admin/system is een beveiligingssamenvatting, geen infrastructuurcredentialsdashboard.

## Eerste super_admin (niet automatisch)

Bij inspectie was bestaande admin `0a0bb72a-1905-4899-88ea-3ae5e6ffa1e8`; bestaande editor `720baa72-e1c1-4905-946e-48561f29e2d2`. Dit bewijst bestaande roltoekenning, niet wie de eigenaar is. Er wordt geen echte gebruiker automatisch super_admin.

Een vertrouwde databasebeheerder moet de exacte geverifieerde user_id invullen. Eenmalig, via SQL Editor/onderhoudsverbinding met database-eigenaarrechten, NIET via client:

```sql
begin;
select pg_advisory_xact_lock(9100926);
-- Vervang GEVERIFIEERDE-USER-UUID na expliciete eigenaarverificatie.
insert into public.user_roles(user_id,role_key,assigned_by)
select id,'super_admin',null from public.profiles
where id='GEVERIFIEERDE-USER-UUID'::uuid and account_status='active'
on conflict do nothing;
insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,metadata)
select null,'users.super_admin_bootstrap','profiles',id::text,'{"source":"verified database owner bootstrap"}'::jsonb
from public.profiles where id='GEVERIFIEERDE-USER-UUID'::uuid;
commit;
```

Controleer vooraf dat de user_id bestaat, de transactionele resultaten één doelgebruiker tonen, en niemand onbedoeld wordt aangewezen. Daarna kan die persoon kritisch rolbeheer in /admin/users uitvoeren. Het bootstrapvoorbeeld is een instructie, geen automatisch uitgevoerde seed.

## Validatie en testgrenzen

- npm test: 89 bestaande moduletests geslaagd.
- test-database: 38 bestaande isolatie/persistentiecontroles; aangepast aan expliciete RBAC in plaats van profiles.role.
- test-admin-database: 92 controles met echte PostgreSQL/RLS via PGlite, inclusief migration replay, directe writes/RPC-aanvallen, multiple roles, metadata-onafhankelijke permissions, publicatiestatus, forum, featurevisibility, blokkeerstatus, audit en fotoconcurrency.
- test-platform: 105 HTML/securitychecks; release scan geen secret/service-rolelek.
- FVT-contentregressie: 24 controles; moderator/editor/publisher expliciet samen toegekend aan één lokale testactor.
- Prominentendatabase: 21 historie/atomiciteit/RLS-controles. Fotoregistry: 11 bestaande controles. Publieke routing/feed: 3 tests.
- Browser: 31 acceptancechecks tegen een geïsoleerde test-Auth/PostgREST-transportlaag met echte PostgreSQL-RLS. Dit is geen bewijs van productie-GoTrue-login. Geen productie-testcontent voor de lokale suite.
- Screenshots en JSON-resultaat lokaal: test-results/admin; 1920/1366/820/390, geen horizontale overflow, mobiele drawer/Escape. Visueel bekeken op 1366 en 390.
- Build: geslaagd. Exacte releasecommit, staged/live deployment en livechecks worden in het eindrapport toegevoegd na release.

## Rollback

Behoud nieuwe audit/role/contenttabellen en historische data. Geen DROP TABLE of terugmigratie die content verwijdert. Bij een UI-probleem herstel een eerder geverifieerde Vercel-deployment met dezelfde permission-RPC ondersteuning of pas de UI aan; de oude editor-publicatie/moderatieflows zijn bewust niet meer toegestaan. Terug naar de vóór-RBAC-UI zou beveiligde redacteursacties laten mislukken, dus restore security niet blind naar de brede oude is_editor-policy. Feature kan tijdelijk via de adminvisibility verborgen worden. Zet nieuwe article statuses niet blind terug naar draft/published; behoud data en maak een expliciete conversiemigratie indien noodzakelijk. Supabase migrationhistory zorgt voor eenmaal toepassen; de nieuwe migratie zelf is lokaal herhaalbaar getest.

## Resterende grenzen

Eerste echte super_admin moet expliciet geverifieerd/toegewezen worden. Dashboard meldingen alleen als er een echte rapportagetabel komt. De bestaande invoermodule genereert Sheets-export; directe handmatige recordcorrectie is niet geïntroduceerd. Geen account-e-mail/laatste-loginbeheer en geen providercredential/systeemconfiguratie-editor. Forumreacties en topics kunnen moderatief verborgen/verwijderd worden; er is geen nieuw appeals/reportingsysteem. Productie-browserbewijs en productie-auth/API-tests zijn afzonderlijk van de lokale tests te rapporteren.
