# Deployment en beheer

Gebruik uitsluitend Supabase `rzunbquzffdivlpuomjc` en Vercel-team `larswoudenberg-6243`. AFTRAP Control is geen migratiedoel.

## Publiceren

```sh
npm run check
npx vercel link --project fantasy-studio-app --scope larswoudenberg-6243
npx vercel deploy --prod --scope larswoudenberg-6243
```

De productieomgeving heeft `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`. Previewomgevingen vereisen dezelfde expliciet geconfigureerde publieke variabelen. `.vercelignore` sluit lokale credentials, testresultaten, browserprofielen, desktopreleases en niet benodigde bronnen uit. De GitHub-accountverbinding binnen Vercel ontbreekt nog; CLI-deployment werkt zelfstandig. Voor automatisch deployen verbind de canonical repository `larsarjan/fantasy-studio-app`, niet de oorspronkelijke repo.

## Database

De migrations zijn live toegepast en hun bestandsversies corresponderen met Supabase migration history. Voor toekomstige wijzigingen: `supabase migration new <name>`, lokaal testen, doelproject controleren en dan toepassen. Voer bestaande migrations niet opnieuw als losse SQL uit. Gebruik nooit `db reset` op productie. Controleer na elke migratie RLS en advisors.

## Auth en e-mail

`supabase/config.toml` bevat de toegepaste productieconfiguratie, exacte callbacks, minimumwachtwoordlengte 12 en bevestiging. Controleer met `supabase config diff --project-ref rzunbquzffdivlpuomjc` vóór `config push`. Op 6 oktober 2026 waren alle gedeclareerde authinstellingen gelijk aan live. Een CLI-account zonder rechten op dit project kan de configuratie niet aanpassen, ook als de MCP-databaseverbinding werkt.

Site URL: `https://fantasy-studio-app.vercel.app`.
Redirects: `/auth/callback` en `/auth/callback?flow=recovery` op die origin; daarnaast expliciete localhostontwikkelcallbacks. Voeg geen brede willekeurige domeinwildcards toe.

Confirmation, recovery, invite en email_change hebben Nederlands/FVT HTML en platte-tekstvoorbeelden onder `supabase/templates`. De HTML gebruikt Supabase's veilige ConfirmationURL-placeholder. De uitnodigingscallback biedt wachtwoordinstelling. Magic-link-login is geen productflow. Supabase weigerde het daadwerkelijk toepassen van custom templates met HTTP 400: gratis tier + standaard mailprovider staat templatewijziging niet toe. Na SMTP-inrichting: voeg het fragment `supabase/auth-email-templates.toml` toe aan config.toml, diff en push. Het fragment bevat ook het SMTP-configuratievoorbeeld; vul secrets via env-referenties in.

Voor publieke registratie is een SMTP-provider met geverifieerd afzenderadres nodig. Vereiste waarden: SMTP host, poort, username, password en afzenderadres. Vul deze alleen in Supabase of server-side configuratie in. De ingebouwde Supabase-maildienst is beperkt en is geen bewezen publieke mailbezorging. Zet e-mailbevestiging niet uit om een bezorgingsprobleem te omzeilen. Echte bezorging, confirm en reset moeten na SMTP-inrichting met een beheerde mailbox getest worden.

## Rollen

Nieuwe accounts worden viewer. Dat betekent: eigen team/voorkeuren/notities beheren, gedeelde voetbaldata lezen. Promoveer alleen een gecontroleerd gebruikers-ID via beheer-SQL in profiles naar editor/admin. De app geeft geen zelfpromotie-optie. Tijdelijke acceptatieaccounts zijn geen beheeraccounts voor dagelijks gebruik.

## Rollback en herstel

Bewaar vóór nieuwe schemawijzigingen een gecontroleerde database-export/back-up. De gratis database heeft geen veronderstelde PITR-garantie. Voor frontendrollback kan een eerder READY Vercel-deployment opnieuw gepromoveerd worden. Controleer eerst compatibiliteit met de huidige migrations; draai schemawijzigingen niet blind terug.

Een team-save maakt een versiehistorierij. Exporteer eigen gegevens via Instellingen; herstel een gewenste oude state/settings via de save-RPC met de actuele versie zodat herstel zelf weer een nieuwe versie wordt. Notities hebben versiebeveiliging maar geen volledige historische payloadback-up. Verwijder of herstel geen privédata namens een gebruiker zonder concrete opdracht.

Bij een cloudstoring blijft geladen referentiedata bruikbaar. Private writes melden fouten; de gebruiker blijft op de pagina om opnieuw op te slaan. Bij versieconflict exporteer zo nodig de cloudgegevens en herlaad; overschrijf nooit automatisch de nieuwere versie. Vóór tests met gedeelde import eerst de doelprojectref en bestaande datasets controleren.
