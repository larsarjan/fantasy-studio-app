import { loadEnv } from 'vite'
const env = { ...loadEnv('production',process.cwd(),''), ...process.env }
if (env.VITE_AUTH_CAPTCHA_ENABLED === 'true') {
  const sitekey = env.VITE_TURNSTILE_SITE_KEY || ''
  if (!sitekey || /^[123]x0+/.test(sitekey)) throw new Error('A real production Turnstile sitekey is required; test keys must never ship.')
  if (env.VITE_AUTH_CAPTCHA_LOGIN !== 'true') throw new Error('Native Supabase CAPTCHA also protects password login. Coordinate approval, frontend and Auth activation before enabling it.')
}
if (env.VERCEL || env.REQUIRE_CLOUD_CONFIG) {
  const url = new URL(env.VITE_SUPABASE_URL || 'http://invalid')
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.hostname.startsWith('wyfhnmsautnpgwbhaqzn.')) throw new Error('A dedicated Fantasy Studio Supabase project is required; AFTRAP Control must never be used.')
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY??''
  if(!key.startsWith('sb_publishable_')) throw new Error('Configure VITE_SUPABASE_PUBLISHABLE_KEY with a public publishable key.')
}
