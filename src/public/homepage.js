import { safeHtml } from "../platform/html.js";
import { appUrl } from "../platform/client.js";
import { relativeRoute } from "../platform/routes.js";
import {
  channelUrl,
  instagramUrl,
  fallbackVideo,
  validVideo,
} from "./video.js";
import "./homepage.css";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const asset = (name) => appUrl(`landing/${name}`);
const paths = {
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  chart: '<path d="M4 21V13h4v8M10 21V8h4v13M16 21V3h4v18"/>',
  crown: '<path d="m3 6 4 5 5-8 5 8 4-5-3 12H6L3 6Zm3 15h12"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2m4 0h2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`;
let videoController;
const pageContent = {
  videos: [
    "KIJKEN",
    "Fantasy begint met een goed gesprek.",
    "Teamchecks, captainkeuzes en vooruitblikken. Bekijk onze nieuwste aflevering of ontdek alle video’s op het FVT-kanaal.",
    `<a class="fvt-button" href="${channelUrl}" target="_blank" rel="noopener noreferrer">Alle video’s op YouTube ${icon("arrow")}</a>`,
  ],
  community: [
    "MEEDOEN",
    "Samen meer uit fantasy halen.",
    "Praat mee onder onze video’s en volg Fantasy Voetbal Talk op Instagram. De plek voor jouw vragen, ideeën en fantasykeuzes.",
    `<div class="fvt-actions"><a class="fvt-button" href="${channelUrl}" target="_blank" rel="noopener noreferrer">Praat mee op YouTube ${icon("arrow")}</a><a class="fvt-text-link" href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Volg FVT op Instagram ↗</a></div><p><a class="fvt-text-link" href="${appUrl('ranglijsten')}">Volg de FVT-subleague en prominenten ${icon('arrow')}</a></p>`,
  ],
  about: [
    "OVER FVT",
    "Voetbal. Fantasy. Voorsprong.",
    "Fantasy Voetbal Talk brengt Eredivisie-content, community en fantasy-analyse samen. Kijk mee, bespreek je keuzes en onderzoek je selectie in Fantasy Studio.",
    "<p>Studio helpt je spelers te vergelijken, speelrondes vooruit te plannen en je selectie samen te stellen. De analyses ondersteunen jouw keuzes; ze zijn geen garantie op punten.</p>",
  ],
  privacy: [
    "PRIVACY",
    "Jouw account en gegevens.",
    "Voor je Studio-account verwerken we je e-mailadres, profiel, voorkeuren en opgeslagen selectie. Supabase verzorgt de account- en databasevoorzieningen; Vercel verzorgt de hosting.",
    "<p>Je sessie wordt in deze browser bewaard om ingelogd te blijven. Je persoonlijke selectie is gekoppeld aan je account. De publieke homepage gebruikt geen advertentietrackers en laadt geen YouTube-speler automatisch. Een YouTube-thumbnail kan wel door YouTube worden geleverd; een klik opent YouTube, waar hun privacyvoorwaarden gelden.</p><p>Heb je een vraag over je gegevens of wil je je account laten verwijderen? Neem contact op via het officiële FVT-kanaal op de contactpagina. Dit overzicht beschrijft de huidige werking; aanvullende organisatorische privacygegevens worden door FVT aangevuld.</p>",
  ],
  contact: [
    "CONTACT",
    "Laat van je horen.",
    "Een vraag over FVT of Fantasy Studio? Bereik Fantasy Voetbal Talk via ons officiële Instagram-kanaal.",
    `<a class="fvt-button" href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Naar FVT op Instagram ${icon("arrow")}</a><p>Deel geen wachtwoorden, bevestigingslinks of andere accountgeheimen in een bericht.</p>`,
  ],
};
function videoMarkup(video, source) {
  const thumbnail =
    source === "fallback"
      ? asset("video-fallback.jpg")
      : `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  return `<span class="fvt-eyebrow">${source === "fallback" ? "UITGELICHTE VIDEO" : "NIEUWSTE VIDEO"}</span><a class="fvt-video-image" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener noreferrer" aria-label="Bekijk ${escape(video.title)}"><img src="${thumbnail}" width="480" height="270" alt="Thumbnail van ${escape(video.title)}" loading="lazy"><span class="fvt-play">${icon("play")}</span></a><h3>${escape(video.title)}</h3><p class="fvt-video-meta">Fantasy Voetbal Talk Eredivisie<br><time datetime="${escape(video.published)}">${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(video.published))}</time></p><a class="fvt-button fvt-button-outline" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener noreferrer">Bekijk op YouTube ${icon("arrow")}</a>`;
}
export function renderPublic(accountMarkup, { displayName = "", mainMarkup = null, pageTitle = null } = {}) {
  videoController?.abort();
  videoController = new AbortController();
  const route = relativeRoute(location.pathname, import.meta.env.BASE_URL);
  const page = pageContent[route];
  const features = [
    [
      "people",
      "Selectie bouwen",
      "Stel jouw ideale fantasyselectie samen.",
      "optimizer",
    ],
    [
      "chart",
      "Spelers vergelijken",
      "Vergelijk statistieken, prijs en speelkans.",
      "compare",
    ],
    [
      "crown",
      "Captain kiezen",
      "Maak slimmer je captainkeuze per speelronde.",
      "captain",
    ],
    [
      "calendar",
      "Vooruit plannen",
      "Bekijk komende speelrondes en plan vooruit.",
      "fixtures",
    ],
  ];
  const nav = [
    ["", "Home"],
    ["studio", "Studio"],
    ["ranglijsten", "Ranglijsten"],
    ["videos", "Video’s"],
    ["community", "Community"],
    ["about", "Over FVT"],
  ]
    .map(
      ([path, label]) =>
        `<a href="${appUrl(path)}" ${route === path || (path === "ranglijsten" && /^(ranglijsten|prominenten)(\/|$)/.test(route)) || (path === "studio" && route.startsWith("studio/")) ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join("");
  document.title = `${page ? { videos: "Video’s", community: "Community", about: "Over FVT", privacy: "Privacy", contact: "Contact" }[route] : "Fantasy Studio"} | Fantasy Voetbal Talk`;
  document.querySelector("#app").innerHTML =
    safeHtml(`<div class="fvt-public"><a class="fvt-skip" href="#fvt-main">Naar de inhoud</a><div class="fvt-shell"><header class="fvt-header"><a class="fvt-brand" href="${appUrl()}" aria-label="Fantasy Voetbal Talk — Home"><img src="${asset("fvt-logo.png")}" alt="FVT" width="64" height="64"><span>FANTASY VOETBAL TALK<strong>STUDIO</strong></span></a><button class="fvt-menu-toggle" type="button" aria-expanded="false" aria-controls="fvt-nav">Menu ☰</button><nav id="fvt-nav" class="fvt-nav" aria-label="Hoofdnavigatie">${nav}</nav><a class="fvt-header-account" href="#fvt-account">${displayName ? "Mijn Studio" : "Inloggen"} ${icon("arrow")}</a></header>
  <main id="fvt-main" class="fvt-main ${page ? "fvt-subpage" : ""}"><section class="fvt-hero"><span class="fvt-eyebrow">${page ? page[0] : "FVT STUDIO"}</span><h1>${page ? page[1] : "MEER INZICHT.<br>SLIMMERE KEUZES.<br><em>EEN STERKERE SELECTIE.</em>"}</h1><p class="fvt-lead">${page ? page[2] : "Spelers, speelschema’s, statistieken en slimme analyses.<br>Alles wat je nodig hebt om betere fantasykeuzes te maken."}</p>${page ? page[3] : '<a class="fvt-mobile-cta fvt-button" href="#fvt-account">Open jouw Studio ' + icon("arrow") + "</a>"}</section>
  <aside id="fvt-account" class="fvt-account">${accountMarkup}</aside>
  <section class="fvt-features" aria-label="Ontdek Fantasy Studio">${features.map(([symbol, title, text, screen]) => `<a class="fvt-feature" href="${appUrl(`studio/${screen}`)}"><span class="fvt-feature-icon">${icon(symbol)}</span><span><h2>${title}</h2><p>${text}</p></span></a>`).join("")}</section>
  <section class="fvt-showcase" aria-label="FVT in beeld"><article id="fvt-video" class="fvt-video">${videoMarkup(fallbackVideo, "fallback")}</article><a class="fvt-preview" href="${appUrl("studio")}" aria-label="Open Fantasy Studio"><div class="fvt-preview-bar"><span class="fvt-window-dots">● ● ●</span><span>FANTASY STUDIO · ECHTE PRODUCTPREVIEW</span>${icon("arrow")}</div><img src="${asset("studio-preview.jpg")}" width="1440" height="1000" alt="De echte Fantasy Studio met FVT-logo, spelerslijst en spelersfilters" loading="lazy"><span class="fvt-preview-caption">Jouw selectie. Jouw inzichten. ${icon("arrow")}</span></a></section>
  </main><nav class="fvt-pillars" aria-label="Ontdek FVT"><a href="${appUrl("videos")}"><span>01 / KIJKEN</span>De nieuwste fantasyvideo’s ${icon("arrow")}</a><a href="${appUrl("community")}"><span>02 / MEEDOEN</span>Deel jouw voetbalblik ${icon("arrow")}</a><a href="${appUrl("studio")}"><span>03 / ANALYSEREN</span>Maak jouw volgende keuze ${icon("arrow")}</a></nav><footer class="fvt-footer"><span>© ${new Date().getFullYear()} Fantasy Voetbal Talk · Eredivisie</span><nav aria-label="Footer"><a href="${channelUrl}" target="_blank" rel="noopener noreferrer">YouTube ↗</a><a href="${instagramUrl}" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href="${appUrl("privacy")}">Privacy</a><a href="${appUrl("contact")}">Contact</a></nav></footer></div></div>`);
  document.querySelector(".fvt-menu-toggle").onclick = (event) => {
    const button = event.currentTarget;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    document.querySelector("#fvt-nav").classList.toggle("is-open", open);
  };
  if (mainMarkup !== null) {
    const main = document.querySelector('#fvt-main');
    main.className = 'prom-main';
    main.innerHTML = safeHtml(mainMarkup);
    document.querySelector('.fvt-header-account').href = appUrl('#fvt-account');
    if (pageTitle) document.title = `${pageTitle} | Fantasy Voetbal Talk`;
    return;
  }
  if (!route) {
    const teaser=document.createElement('section');
    teaser.className='prom-home';
    teaser.innerHTML=safeHtml(`<span class="fvt-eyebrow">VOLG DE KENNERS</span><h2>Prominenten</h2><p>De keuzes en prestaties van creators, ESPN-kenners en onze subleague.</p><div id="prom-home-leaders" role="status">Ranglijst laden…</div><a class="fvt-text-link" href="${appUrl('ranglijsten')}">Bekijk volledige ranglijst ${icon('arrow')}</a>`);
    document.querySelector('#fvt-main').append(teaser);
    import('./prominents.js').then(m=>m.mountHomeTeaser(teaser)).catch(()=>{if(teaser.isConnected)teaser.querySelector('#prom-home-leaders').textContent='Bekijk de ranglijst voor de nieuwste stand.';});
  }
  const videoElement = document.querySelector("#fvt-video");
  fetch(appUrl("api/latest-video"), { signal: videoController.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && validVideo(data.video) && videoElement.isConnected)
        videoElement.innerHTML = safeHtml(
          videoMarkup(
            data.video,
            data.source === "youtube" ? "youtube" : "fallback",
          ),
        );
    })
    .catch(() => {});
}
export function renderWelcome(displayName) {
  const name = displayName?.trim() || "fantasymanager";
  renderPublic(
    `<span class="fvt-eyebrow">FANTASY STUDIO</span><div class="fvt-avatar" aria-hidden="true">${escape(name.slice(0, 1).toUpperCase())}</div><h2>Welkom terug,<br>${escape(name)}</h2><p>Je Studio staat voor je klaar. Werk verder aan jouw selectie en ontdek de nieuwste inzichten.</p><a class="fvt-button" href="${appUrl("studio")}">Open Fantasy Studio ${icon("arrow")}</a><p class="fvt-account-note">${icon("lock")} Je selectie, instellingen en analyses blijven veilig bewaard.</p>`,
    { displayName: name },
  );
}
