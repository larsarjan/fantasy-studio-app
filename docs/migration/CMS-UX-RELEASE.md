# Dagelijkse CMS-UX — 9 oktober 2026

Uitsluitend nieuws- en videowerkflows verbeterd. Geen nieuwe authlaag, rollenmodel of vervanging van bestaande artikel/video-RLS, permissions, backendautorisatie of auditlogging.

## Nieuws

- /admin/nieuws opent een overzicht, geen invoerformulier. Titel, korte intro, categorie, Nederlandse status, auteur, publicatie-/wijzigingsdatum en uitgelicht ja/nee; zoeken, categorie- en statusfilter, paginatie, duidelijke empty states.
- + Nieuw artikel en afzonderlijk bewerkformulier. Preview, publiceren, verbergen, categorie wijzigen en bevestigde verwijdering vanuit het overzicht. Bestaande permissiongrenzen bepalen beschikbare acties.
- Korte intro / samenvatting met gevraagde helpertekst. Artikeltekst met kleine Squire 2.4.9-editor: alinea/H2/H3, vet/cursief, veilige links, lijsten, quote, undo/redo. Editor wordt alleen voor het artikelformulier geladen (~19 kB gzip inclusief eigen toolbar).
- Nieuwe slug automatisch uit titel; handmatige aanpassing uitsluitend onder Geavanceerd. Bestaande artikeladressen blijven bij titelwijzigingen behouden. De bestaande UNIQUE-constraint beslist atomair over duplicaten; automatisch gegenereerde conflicten worden begrensd met een unieke suffix herhaald, handmatige conflicten krijgen een duidelijke melding.
- Expliciete concept-, review-, voorbeeld- en publicatieacties. Geplande publicatie via status plus toekomstige datum. Dubbele opslagacties en snelle rijacties worden tijdens de lopende write geblokkeerd. De opslagmelding vervalt bij daadwerkelijke inhoudswijzigingen; waarschuwing bij verlaten met onopgeslagen inhoud.

## Afbeeldingen

Nieuwe Supabase Storage-bucket `news-images`: publiek LEZEN voor artikelafbeeldingen, geen publieke writes. INSERT alleen voor bestaande articles.create/edit-permissions en eigen gebruikersprefix; geen UPDATE-policy/overschrijven. Unieke bestandsnamen voor vervanging. DELETE alleen eigen niet-meer-gerefereerde bestanden, met server-side controle over alle artikelen. De bestaande content/RBAC-policies zijn niet aangepast.

Bestand kiezen of drag-and-drop, preview, vervangen, verwijderen, automatisch bewaren van de openbare URL in het bestaande image_url-veld. JPG/JPEG/PNG/WebP, maximaal 5 MB; client decodeert/re-encodeert rasterafbeeldingen, wijst lege/ongeldige bestanden en te grote afmetingen af. Storage handhaaft MIME/5 MB ook bij directe API-calls. Afbeelding wijzigen wordt pas definitief aan het artikel gekoppeld bij opslaan. Bewerken behoudt bestaande afbeeldingen. Assets die nog door artikelen worden gebruikt, kunnen niet via de cleanup verwijderd worden.

Migratie: `20261009161508_cms_news_image_uploads.sql`, gelijk aan de werkelijk toegepaste Supabase-history. Enige nieuwe databasefunctionaliteit: bucketconfiguratie, bucketpolicies en private referentiecheck; geen wijziging aan bestaande artikeldata/tabellen.

## Veilige tekst en compatibiliteit

Rich text wordt met `<!--fvt-rich-text-v1-->` plus strikt gesaneerde HTML in het bestaande body-veld opgeslagen. Alleen p/h2/h3/strong/b/em/i/a/ul/ol/li/blockquote/br; geen scripts, afbeeldingen, SVG, iframe, events, styles of interne attributen. Linkschemes beperkt tot http/https/mailto. Bij publieke weergave en preview opnieuw gesaneerd, dus ook directe API-injectie kan niet uitvoeren. Oude ongemarkeerde tekst blijft gewone tekst met behoud van alinea's, regeleinden en letterlijk geschreven HTML. Geen oude bodywaarden gemigreerd of herschreven. Publieke routes blijven bestaan.

## Video's

/admin/videos is primair een gepagineerd overzicht met thumbnail, titel, rubriek, publicatiedatum, zichtbaar/verborgen en uitgelicht ja/nee. Rubriek direct veranderen zonder nieuwe registratie, tonen/verbergen en bevestigde verwijdering. Bestaande FVT-rubrieken en centrale classificatie hergebruikt.

Apart formulier achter + Video toevoegen. YouTube-URL levert ID en thumbnail; titel/rubriek/datum worden ingevuld als de aflevering al in de bestaande feed zit. Onbekende aflevering of onbereikbare feed: duidelijke instructie om de titel zelf in te vullen, geen verzonnen metadata of nieuwe scraper. Eigen thumbnail/sortering uitsluitend onder Geavanceerd.

## Validatie

- 97 bestaande + nieuwe unit/moduletests geslaagd (`npm test`, 8 nieuwe content/uploadtests).
- 38 bestaande persistentiechecks, 97 bestaande admin-PG/RLS-checks, 117 HTML/securitychecks; `npm run check` geslaagd.
- 12 lokale Storage-policychecks; 11 echte live Supabase Storage/contentchecks: upload/public read, member denial, SVG/size/owner-prefixgrenzen, referentiebescherming, behoud afbeelding, editorpublish-denial en publisherpublicatie.
- 46 CMS-browserchecks met echte Supabase Auth/REST/Storage tegen lokale frontend, inclusief alle tekstopmaak, preview, afbeeldingsupload/behoud/vervanging/verwijdering (ook DB-verificatie), veilige dubbele slugs, publisheractie, rubriekwissel, zichtbaarheid en desktop 1366/mobiel 390. Screenshots visueel bekeken.
- CMS en editor hebben aparte lazy chunks; geen editor in de publieke initialisatie. Geen secret/service-role-lek in release-scan.

Bron van bewijs dat autorisatie niet is herontworpen: bestaande function-fingerprint `c4ba58f320dc60ed4cf31fe70f261ac3`, publieke policy-fingerprint `3b742d95ab565be376ff6b9692e4eb0e`, role-mapping-fingerprint `d022456e4a47ef707cab76abac775a32` identiek vóór en na de Storage-migratie. Bestaande echte super_admin blijft behouden. Tijdelijke testaccounts/content/assets worden na productieacceptatie verwijderd; auditbewijs blijft append-only behouden.

## Release

Doel is hetzelfde Vercel-project `fantasy-studio-app` / https://fantasyvoetbaltalk.nl. Eerst productiebuild zonder domeinpromotie; na release-identiteitcheck promotie en herhaalde live CMS-browseracceptatie. Build/commit/deployment en definitieve opruiming worden na productiecontrole gerapporteerd.

Rollback: behoud Storage-bucket/objects en bodywaarden. Gebruik een CMS-compatibele frontend voor rich-textweergave; een oudere frontend zou de nieuwe HTML veilig als letterlijke tekst tonen. Geen databasecontent of rollen verwijderen als rollbackmaatregel.
