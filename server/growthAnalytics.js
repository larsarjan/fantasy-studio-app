import {createSign} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'

export function reportPeriod(start,end,now=new Date()) {
  const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
  if(!valid(start)||!valid(end))throw Error('period')
  const days=(Date.parse(end)-Date.parse(start))/86400000+1
  if(days<1||days>366||end>now.toISOString().slice(0,10))throw Error('period')
  const day=n=>new Date(n).toISOString().slice(0,10)
  return {start,end,previousStart:day(Date.parse(start)-days*86400000),previousEnd:day(Date.parse(start)-86400000)}
}
const rows=report=>(report.rows||[]).map(row=>Object.fromEntries([...(report.dimensionHeaders||[]).map((h,i)=>[h.name,row.dimensionValues[i]?.value||'']),...(report.metricHeaders||[]).map((h,i)=>[h.name,Number(row.metricValues[i]?.value)||0])]))
const metrics=['activeUsers','newUsers','sessions','screenPageViews','screenPageViewsPerSession','userEngagementDuration','engagementRate']
export const gaReports=[
  ['summary',[],metrics],['trend',['date'],['activeUsers','sessions','screenPageViews']],
  ['channels',['sessionDefaultChannelGroup'],['activeUsers','sessions']],
  ['sources',['sessionSource','sessionMedium'],['activeUsers','sessions']],
  ['landings',['landingPage'],['sessions','activeUsers','engagementRate','keyEvents']],
  ['pages',['pagePath'],['screenPageViews','activeUsers','userEngagementDuration']],
  ['audience',['newVsReturning'],['activeUsers']],['devices',['deviceCategory'],['activeUsers']],['countries',['country'],['activeUsers']],
  ['campaigns',['sessionCampaignName','sessionSource','sessionMedium'],['activeUsers','newUsers','sessions','screenPageViews','engagementRate']],
  ['campaignLandings',['sessionCampaignName','landingPage'],['sessions']],
  ['campaignEvents',['sessionCampaignName','eventName'],['eventCount']],
]
export function createGoogleReports({env=process.env,fetcher=fetch,now=Date.now}={}) {
  let token=null;const cache=new Map()
  async function jsonFetch(url,options) {
    const response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)})
    if(!response.ok){const e=Error(response.status===401||response.status===403?'permissions':'api');throw e}
    return response.json()
  }
  async function accessToken(){
    if(token?.expires>now())return token.value
    const issued=Math.floor(now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
    const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:env.GOOGLE_ANALYTICS_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600})
    const signature=createSign('RSA-SHA256').update(unsigned).sign(env.GOOGLE_ANALYTICS_PRIVATE_KEY.replace(/\\n/g,'\n'),'base64url')
    const result=await jsonFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})})
    token={value:result.access_token,expires:now()+Math.min(3300,result.expires_in||3300)*1000};return token.value
  }
  const post=async(url,body)=>jsonFetch(url,{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:JSON.stringify(body)})
  async function ga(period){
    if(!/^\d+$/.test(env.GA4_PROPERTY_ID||''))return {status:'not_connected'}
    const endpoint='https://analyticsdata.googleapis.com/v1beta/properties/'+env.GA4_PROPERTY_ID
    const output={};let previous
    for(const [key,dimensions,fields] of gaReports){
      const request={dateRanges:[{startDate:period.start,endDate:period.end}],dimensions:dimensions.map(name=>({name})),metrics:fields.map(name=>({name})),limit:key==='trend'?366:50,orderBys:key==='trend'?[{dimension:{dimensionName:'date'}}]:[{metric:{metricName:fields[0]},desc:true}]}
      if(key==='campaignEvents')request.dimensionFilter={filter:{fieldName:'eventName',inListFilter:{values:['studio_open','news_open','youtube_click','player_profile_open','fixture_compare_open','login_success']}}}
      output[key]=rows(await post(endpoint+':runReport',request))
      if(key==='summary')previous=rows(await post(endpoint+':runReport',{...request,dateRanges:[{startDate:period.previousStart,endDate:period.previousEnd}]}))
    }
    return {status:'ready',...output,previous}
  }
  async function seo(period){
    const endpoint='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent('sc-domain:fantasyvoetbaltalk.nl')+'/searchAnalytics/query'
    const output={}
    for(const [key,dimensions] of [['summary',[]],['queries',['query']],['pages',['page']],['pageQueries',['page','query']]])output[key]=(await post(endpoint,{startDate:period.start,endDate:period.end,dimensions,rowLimit:50,dataState:'final'})).rows||[]
    output.previous=(await post(endpoint,{startDate:period.previousStart,endDate:period.previousEnd,rowLimit:1,dataState:'final'})).rows||[]
    return {status:'ready',...output}
  }
  async function cached(source,period,ttl,load){
    if(!env.GOOGLE_ANALYTICS_CLIENT_EMAIL||!env.GOOGLE_ANALYTICS_PRIVATE_KEY)return {status:'not_connected'}
    const key=source+JSON.stringify(period),old=cache.get(key)
    if(old&&old.expires>now())return old.promise
    if(cache.size>=50)cache.delete(cache.keys().next().value)
    const promise=load(period).then(data=>({...data,updatedAt:new Date(now()).toISOString()})).catch(error=>{cache.delete(key);return {status:error.message==='permissions'?'permissions':'error'}})
    cache.set(key,{expires:now()+ttl,promise});return promise
  }
  return async period=>{const [ga4,seoData]=await Promise.all([cached('ga',period,300000,ga),cached('seo',period,1800000,seo)]);return {ga4,seo:seoData}}
}
export function createGrowthHandler({env=process.env,clientFactory=createClient,reports=createGoogleReports({env})}={}) {
  const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
  return async request=>{
    if(request.method!=='GET')return json({error:'Methode niet toegestaan.'},405)
    const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))return json({error:'Log opnieuw in.'},401)
    try{
      const client=clientFactory(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(8000)})}})
      const user=await client.auth.getUser(auth.slice(7));if(user.error||!user.data?.user)return json({error:'Log opnieuw in.'},401)
      const access=await client.rpc('current_access')
      if(access.error||!access.data?.permissions?.includes('admin.access')||!access.data.permissions.includes('analytics.view'))return json({error:'Geen toegang tot Analytics & Groei.'},403)
      const url=new URL(request.url);let period
      try{period=reportPeriod(url.searchParams.get('start'),url.searchParams.get('end'))}catch{return json({error:'Kies een geldige periode van maximaal 366 dagen.'},400)}
      return json({period,...await reports(period)})
    }catch{return json({error:'Analytics tijdelijk niet beschikbaar.'},503)}
  }
}
