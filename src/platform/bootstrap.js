import { safeHtml } from './html.js'
import { requireSession, renderAuth } from './auth.js'
import { initializeUser } from './repository.js'
import { friendlyError, supabase } from './client.js'
import { isPublicRoute, isProminentRoute, relativeRoute } from './routes.js'
import { renderWelcome } from '../public/homepage.js'

document.querySelector('#app').innerHTML = safeHtml('<div class="platform-loading" role="status">Fantasy Studio laden…</div>')
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement) event.target.hidden = true
}, true)
try {
  const route = relativeRoute(location.pathname, import.meta.env.BASE_URL)
  const isPublic = isPublicRoute(route)
  let session = null
  if (isPublic && !/[#&](access_token|error)=/.test(location.hash) && !['code','error','flow'].some(key => new URLSearchParams(location.search).has(key))) {
    if (isProminentRoute(route)) {
      const { renderProminentPage } = await import('../public/prominents.js')
      await renderProminentPage()
    } else {
    renderAuth()
    const result = supabase ? await supabase.auth.getSession() : null
    if (result?.data?.session) {
      const {user} = result.data.session
      const {data} = await supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle()
      renderWelcome(data?.display_name)
    }
    }
  } else session = await requireSession()
  if (session) {
    document.querySelector('#app').innerHTML = safeHtml('<div class="platform-loading" role="status"><h1>Je Studio openen</h1><p>Je account en de nieuwste voetbaldata worden geladen.</p><small>Bij het eerste bezoek berekenen we ook de spelersscores. Dit kan even duren.</small></div>')
    const user = await initializeUser(session)
    const { restoreManagerState } = await import('../modules/optimizer.js')
    if (user.team) restoreManagerState(user.team.state, user.team.settings)
    const { setProfileAccount } = await import('../modules/profile.js')
    setProfileAccount(session.user)
    await import('../main.js')
    const { mountAccount } = await import('./settings.js')
    mountAccount(session)
  }
} catch (error) {
  const root = document.querySelector('#app')
  root.innerHTML = safeHtml('<main class="platform-loading"><h1>Studio kon niet openen</h1><p id="startup-error"></p><button id="startup-retry">Opnieuw proberen</button></main>')
  document.querySelector('#startup-error').textContent = friendlyError(error)
  document.querySelector('#startup-retry').onclick = () => location.reload()
}
