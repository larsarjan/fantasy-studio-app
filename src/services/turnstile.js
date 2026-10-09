let loading
export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('captcha_unavailable')) }
    const timer = setTimeout(fail, 15000)
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true; script.defer = true
    script.onload = () => { clearTimeout(timer); window.turnstile ? resolve(window.turnstile) : fail() }
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}

export function mountTurnstile(container, { sitekey, onChange, load = loadTurnstile }) {
  let token = '', widget, api, removed = false, generation = 0
  const state = (value, message = '') => { if (!removed) { token = value; onChange({ token, message }) } }
  const start = async () => {
    const current = ++generation
    state('', 'Beveiligingscontrole laden…')
    if (!sitekey) return state('', 'De beveiligingscontrole is nog niet ingesteld. Probeer het later opnieuw.')
    try {
      api = await load()
      if (removed || generation !== current) return
      if (widget !== undefined) api.remove(widget)
      widget = api.render(container, {
        sitekey, theme: 'auto', size: 'flexible', language: 'nl',
        callback: value => state(value, 'Verificatie geslaagd.'),
        'expired-callback': () => state('', 'Je verificatie is verlopen. Verifieer opnieuw.'),
        'timeout-callback': () => state('', 'De verificatie duurde te lang. Probeer opnieuw.'),
        'error-callback': () => { state('', 'Verificatie mislukt. Controleer je verbinding of blokkeringen en probeer opnieuw.'); return true },
      })
    } catch { state('', 'Beveiligingscontrole niet bereikbaar. Controleer je verbinding of blokkeringen en probeer opnieuw.') }
  }
  start()
  return {
    token: () => token,
    reset: () => { state('', 'Verifieer opnieuw om verder te gaan.'); if (api && widget !== undefined) api.reset(widget); else start() },
    destroy: () => { removed = true; generation++; token = ''; if (api && widget !== undefined) api.remove(widget) },
  }
}
