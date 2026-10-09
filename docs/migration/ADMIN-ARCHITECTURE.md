# FVT Admin Center — inspectie vóór wijziging

Inspectie 9 oktober 2026. Productiebron: `larsarjan/fantasy-studio-app`, HEAD `f17745674dce0f1beffa27bc4c59cfddcc191962`. De bovenliggende werkmap is een oudere desktoprepository en wordt niet als productiebron gebruikt.

- Vite / vanilla JS, SPA-rewrites in Vercel; routes in platform/routes.js en bootstrap.js. Publiek: home, nieuws, community, videos, prominenten/ranglijsten. Studio wordt geladen na Supabase-login.
- Bestaande Supabase Auth: PKCE, persistent session, password reset/invite via auth.js; profiles.id verwijst naar auth.users. Persoonlijke selecties, versies, voorkeuren en transfernotities hebben eigenaren-RLS en concurrency checks.
- profiles.role: viewer/editor/admin. SELECT eigen profiel; UPDATE alleen display_name/favorite_club via kolomrechten. Geen user_metadata voor rollen. private.is_editor() geeft editor én admin toegang tot referentie-import, nieuws-publicatie en forum-moderatie. Dit is te breed voor de gevraagde scheiding.
- Productiedatabase onderzocht via catalogus: policies, kolommen, functies en triggers. Eén bestaande admin, één editor; overige profielen viewer. Geen super_admin of relationele permissielaag.
- news_articles/news_categories bestaan: draft/published, auteur via servertrigger, slug/tekst/https-validatie. Redactiebeheer op /nieuws/beheer. Forumtabellen bestaan met openbare reads, eigenaar-writes, rate limit, pin/close RPC. Editor heeft moderatie; categoriebeheer zit op openbare pagina.
- Video's: openbare YouTube-feed via /api/latest-video, centrale classificatie in public/videoCatalog.js. Geen video-CMS-tabel.
- Centrale spelersfoto's: player_photos, playerPhotos.js/runtime, lokale manifest-fallback. Writes alleen bestaande admin. Hergebruiken, geen nieuw fotosysteem.
- Studio: invoer-menu en /studio/input zichtbaar voor alle ingelogde leden. Lokale history/match-input en Google Sheets sync. Scherm verplaatsen naar /admin/input; cloud-data writes apart beveiligen. Persoonlijke selectie/import en persoonlijke transfernotities blijven ledenfuncties.
- Sync: reference_imports, prominent_sync_runs/jobs, price-sync/prominent-sync Edge Functions. Service-role alleen in serverfuncties; client uitsluitend publishable key. Handmatige prominent-sync controleert nu hardcoded admin; uitbreiden naar sync.run met actuele databasepermissions.
- Feature flags: build-time TRANSFER_DEADLINE_ENABLED, geen centrale databasevisibility. Toevoegen met routeguards én restrictieve RLS bij zelfstandige datasets; gedeelde spelersdata blijft beschikbaar voor toegankelijke modules.
- Tests bestaan met PGlite (echte PostgreSQL-policies lokaal), node tests, browser/API-scripts. Bestaande tests veronderstellen brede editorrechten; aanpassen aan nieuwe semantiek en aparte regressietests toevoegen.

Ontwerp: relationele roles/permissions/role_permissions/user_roles als enige nieuwe autorisatiebron. Viewer -> member; bestaande admin/editor behouden. profiles.role blijft uitsluitend compatibiliteitsweergave en is geen autorisatiebron. Writes naar rollen alleen via gecontroleerde RPC met serialisatie, grenschecks en append-only audit. Frontend haalt actuele permissions via RPC, geen rolpresets als beveiligingsbron. Nieuwe beheeracties hergebruiken bestaande tabellen met RLS, kolomrechten en servertriggers. Geen productie-migratie vóór lokale beveiligingschecks. Eerste super_admin alleen expliciet op geverifieerde user_id via gedocumenteerde databasebootstrap.

## Inventaris interne tools

| Route | Huidige toegang | Doelgroep | Risico | Aanpak |
| --- | --- | --- | --- | --- |
| /nieuws/beheer | editor/admin | editor/publisher | editor kan publiceren | naar /admin/nieuws; statusovergangen servergecontroleerd |
| /community | publieke pagina met editor controls | moderator | redactie kan modereren | beheer naar /admin/community, alleen eigen contentacties publiek |
| /studio/input | alle leden | data.correct | lokale invoer vermengd met consumenteninterface | /admin/input, bestaande module behouden |
| Studio synchroniseren | alle leden, cloudpublish editor/admin | sync.run/data.correct | onverwachte datasetvervanging | adminactie; backendpermission op import |
| /ranglijsten beheer | admin op openbare pagina | sync.view/run | technische details publiek gemengd | beheer naar /admin/sync |
| /studio/transfersLive | leden, persoonlijke notities | leden | geen gedeeld redactiebeheer | behouden als persoonlijke functie |
| /studio/selection /optimizer import | leden | leden | persoonlijke gegevens | behouden eigenaar-RLS |
| /studio/history | leden | leden lezen, admin invoer | openbare invoerknoppen | invoer afschermen via data.correct |
| /studio/profile /settings | leden | leden | accountvoorkeuren | behouden |
