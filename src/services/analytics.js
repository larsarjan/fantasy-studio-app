export const MEASUREMENT_ID = 'G-TLBCVFX0Q1'
export const CONSENT_KEY = 'fvt.analytics-consent.v1'
const lifetime = 180 * 86400000
export const deniedConsent = {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}
export function readConsent(storage, now = Date.now()) {
  try { const c=JSON.parse(storage.getItem(CONSENT_KEY));return c?.version===1 && typeof c.analytics==='boolean' && c.at<=now && c.at+lifetime>now ? c : null } catch {return null}
}
export function analyticsPage(href) {
  const u=new URL(href)
  if(u.hostname!=='fantasyvoetbaltalk.nl' || u.protocol!=='https:' || /access_token|refresh_token|error=/.test(u.hash) || /preview|test|token|code|email|error|flow/i.test([...u.searchParams.keys()].join(' ')))return null
  const path=u.pathname.replace(/\/$/,'')||'/'
  if(!/^(\/|\/(nieuws|videos|ranglijsten|prominenten|community|about|privacy|contact)(\/[a-z0-9-]+)?|\/studio(?:\/(dashboard|players|compare|fixtures|history|analysis|captain|differentials|dreamteam|prices|selection|profile|settings|beschikbaarheid))?)$/.test(path))return null
  const clean=new URL(path,u.origin)
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
    const value=u.searchParams.get(key)
    if(value && /^[a-z0-9_-]{1,100}$/i.test(value))clean.searchParams.set(key,value)
  }
  const category=path.split('/')[1]||'home'
  return {page_path:path,page_location:clean.href,page_title:({home:'FVT',nieuws:'FVT Nieuws',studio:'Fantasy Studio',videos:'FVT Video’s',ranglijsten:'FVT Ranglijsten',community:'FVT Community'})[category]||'Fantasy Voetbal Talk'}
}
export function createAnalytics({window:w,document:d,storage,enabled=false,now=Date.now}) {
  if(!storage){try{storage=w.localStorage}catch{storage={getItem:()=>null,setItem:()=>{}}}}
  let choice=readConsent(storage,now()),loaded=false,lastPath=null
  const gtag=(...args)=>{w.dataLayer ||= [];w.dataLayer.push(args)}
  const page=()=>analyticsPage(w.location.href)
  const allowed=()=>enabled && !w.navigator.webdriver && choice?.analytics===true && !!page()
  function navigate() {
    w['ga-disable-'+MEASUREMENT_ID]=!allowed()
    if(!allowed()){lastPath=null;return}
    if(!loaded){
      loaded=true;w.gtag=gtag
      gtag('consent','default',deniedConsent)
      gtag('consent','update',{...deniedConsent,analytics_storage:'granted'})
      gtag('js',new Date(now()))
      gtag('config',MEASUREMENT_ID,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_referrer:'',...page()})
      const script=d.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+MEASUREMENT_ID;script.id='fvt-ga4';d.head.append(script)
    }
    const values=page();if(values.page_path===lastPath)return
    lastPath=values.page_path;gtag('event','page_view',{...values,send_to:MEASUREMENT_ID})
    const event=({'/studio':'studio_open','/studio/dashboard':'studio_open','/nieuws':'news_open','/ranglijsten':'rankings_open','/community':'community_open'})[values.page_path]
    if(event)track(event)
  }
  function track(name) {
    if(!allowed() || !loaded || !['studio_open','news_open','rankings_open','community_open','video_click','youtube_click','player_profile_open','fixture_compare_open','login_success'].includes(name))return
    // Deliberately no caller-supplied fields: account, selection and free text never enter GA.
    gtag('event',name,{send_to:MEASUREMENT_ID,page_location:page().page_location,page_title:page().page_title})
  }
  function consent(analytics) {
    choice={version:1,analytics:analytics===true,at:now()}
    try{storage.setItem(CONSENT_KEY,JSON.stringify(choice))}catch{/* Session choice still works. */}
    if(!choice.analytics){
      w['ga-disable-'+MEASUREMENT_ID]=true
      if(loaded)gtag('consent','update',deniedConsent)
      for(const entry of d.cookie.split(';')){
        const name=entry.split('=')[0].trim();if(!/^_ga(?:_|$)/.test(name))continue
        for(const domain of ['', '; Domain=fantasyvoetbaltalk.nl','; Domain=.fantasyvoetbaltalk.nl'])d.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax; Secure'+domain
      }
      lastPath=null
    }else{if(loaded)gtag('consent','update',{...deniedConsent,analytics_storage:'granted'});navigate()}
  }
  return {navigate,track,consent,get choice(){return choice}}
}
