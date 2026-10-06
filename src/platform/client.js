import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const basePath = import.meta.env.BASE_URL
export const supabase = url && key ? createClient(url, key, {
  global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) }) },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null

export function appUrl(path = '') {
  return new URL(`${basePath}${path}`, window.location.origin).href
}

export function friendlyError(error) {
  const code = error?.code ?? ''
  if (!navigator.onLine) return 'Geen internetverbinding. Je wijzigingen zijn nog niet opgeslagen. Probeer het opnieuw zodra je online bent.'
  if (code === 'invalid_credentials') return 'Dit e-mailadres of wachtwoord klopt niet.'
  if (code === 'email_not_confirmed') return 'Bevestig eerst je e-mailadres via de link in je e-mail.'
  if (code === 'email_address_invalid') return 'Dit e-mailadres wordt niet geaccepteerd. Controleer het adres en gebruik een geldig persoonlijk e-mailadres.'
  if (code === 'email_address_not_authorized' || code === 'email_provider_disabled') return 'Registreren is tijdelijk niet beschikbaar. Probeer het later opnieuw.'
  if (code === 'over_email_send_rate_limit' || error?.status === 429) return 'Te veel aanvragen. Wacht even en probeer opnieuw.'
  if (code === 'otp_expired') return 'Deze link is verlopen of al gebruikt. Vraag een nieuwe link aan.'
  if (code === '23505' || code === 'P0001') return 'Deze gegevens zijn inmiddels gewijzigd. Herlaad de pagina voordat je opnieuw opslaat.'
  if (code === '42501') return 'Je hebt geen toestemming om deze gegevens te wijzigen.'
  if (code === 'weak_password') return 'Kies een sterker wachtwoord van minimaal 12 tekens.'
  return 'Dat is niet gelukt. Controleer je verbinding en probeer het opnieuw.'
}
