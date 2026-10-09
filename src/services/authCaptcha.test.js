import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

test('auth forms require fresh CAPTCHA tokens and preserve email redirects', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://fantasyvoetbaltalk.nl/studio/profile' })
  const names = ['document', 'location', 'FormData', '__authCaptchaTest']
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const calls = []; let token = '', notify, resets = 0
  const result = async (...args) => { calls.push(args); return { error: null } }
  try {
    for (const name of names.slice(0, 3)) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
    globalThis.__authCaptchaTest = {
      renderPublic: html => { document.body.innerHTML = html }, icon: () => '', loginDestination: () => '/studio/profile',
      supabase: { auth: { signUp: result, resetPasswordForEmail: result, signInWithPassword: result } },
      appUrl: path => 'https://fantasyvoetbaltalk.nl/' + path, friendlyError: () => 'Verificatie mislukt.',
      mountTurnstile: (_element, options) => {
        notify = options.onChange; token = ''
        return { token: () => token, reset: () => { resets++; token = ''; notify({ token, message: 'Verifieer opnieuw.' }) }, destroy() {} }
      },
    }
    let source = readFileSync(new URL('../platform/auth.js', import.meta.url), 'utf8')
      .replace(/^import .*\r?\n/gm, '')
      .replaceAll('import.meta.env', JSON.stringify({ VITE_AUTH_CAPTCHA_ENABLED: 'true', VITE_AUTH_CAPTCHA_LOGIN: 'false', VITE_TURNSTILE_SITE_KEY: 'test-public-key', BASE_URL: '/' }))
    source = 'const {renderPublic,icon,loginDestination,supabase,appUrl,friendlyError,mountTurnstile}=globalThis.__authCaptchaTest;\n' + source
    const { renderAuth } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
    for (const mode of ['signup', 'forgot']) {
      renderAuth(mode)
      document.querySelector('#auth-email').value = 'captcha-test@example.invalid'
      for (const input of document.querySelectorAll('[type=password]')) input.value = 'AcceptancePassword123!'
      const form = document.querySelector('form'), submit = () => form.onsubmit({ preventDefault() {}, currentTarget: form })
      const before = calls.length
      assert(document.querySelector('[type=submit]').disabled)
      await submit(); assert.equal(calls.length, before, 'programmatic submit without token is blocked')
      token = 'fresh-' + mode; notify({ token, message: 'Geslaagd' })
      assert.equal(document.querySelector('[type=submit]').disabled, false)
      await submit(); assert.equal(calls.length, before + 1)
      const options = mode === 'signup' ? calls.at(-1)[0].options : calls.at(-1)[1]
      assert.equal(options.captchaToken, 'fresh-' + mode)
      assert.equal(options.emailRedirectTo || options.redirectTo, 'https://fantasyvoetbaltalk.nl/auth/callback' + (mode === 'forgot' ? '?flow=recovery' : ''))
      assert.equal(token, ''); assert(document.querySelector('[type=submit]').disabled)
      await submit(); assert.equal(calls.length, before + 1, 'used token cannot be resubmitted')
    }
    assert.equal(resets, 2)
    renderAuth('login'); assert.equal(document.querySelector('#auth-captcha'), null)
    assert.equal(document.querySelector('[type=submit]').disabled, false)
  } finally {
    dom.window.close()
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name] }
  }
})
