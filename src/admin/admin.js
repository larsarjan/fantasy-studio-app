import './admin.css'
import { safeHtml } from '../platform/html.js'
import { supabase, appUrl, friendlyError } from '../platform/client.js'
import { refreshAccess, hasPermission, canOpenAdmin, ADMIN_SECTIONS, featureAllowed } from '../platform/access.js'
import { esc, date } from '../public/contentUI.js'
import { VIDEO_CATEGORIES, videoCategory } from '../public/videoCatalog.js'

const PAGE_SIZE = 30
const unwrap = result => { if (result.error) throw result.error; return result.data }
const chip = value => `<span class="admin-chip ${esc(value)}">${esc(value)}</span>`
const blank = text => `<p class="admin-empty">${esc(text || 'Geen gegevens')}</p>`
const table = (head, rows) => `<div class="admin-table-wrap"><table><thead><tr>${head.map(t => `<th scope="col">${esc(t)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}">Geen gegevens</td></tr>`}</tbody></table></div>`
const card = (title, body) => `<section class="admin-card"><h2>${esc(title)}</h2>${body}</section>`
const link = (section, text, query = '') => `<a href="${appUrl('admin/' + section + query)}">${esc(text)}</a>`
const safeName = name => ['title','body','name'].includes(name) ? 'fvt_' + name : name
const field = (label, name, value = '', attributes = '') => `<label>${esc(label)}<input name="${safeName(name)}" value="${esc(value)}" ${attributes}></label>`
const select = (label, name, values, selected = '') => `<label>${esc(label)}<select name="${name}">${values.map(v => { const [key, text] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(text)}</option>` }).join('')}</select></label>`
const check = (label, name, value) => `<label><input type="checkbox" name="${name}" ${value ? 'checked' : ''}>${esc(label)}</label>`
const textArea = (label, name, value = '', max = 80000) => `<label>${esc(label)}<textarea name="${safeName(name)}" rows="8" maxlength="${max}">${esc(value)}</textarea></label>`
const localDate = iso => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
let account, root, permissionMap = []
const allowed = p => hasPermission(account, p)
const html = markup => { root.innerHTML = safeHtml(markup) }
const status = message => { const node = root.querySelector('[data-status]'); if (node) node.textContent = message }
const action = (label, id, permission, danger = false) => allowed(permission) ? `<button type="button" id="${id}" class="${danger ? 'admin-danger' : ''}">${label}</button>` : ''
const pageNavigation = (section, page, hasMore, query = '') => `<div class="admin-actions">${page ? link(section, '← Vorige', `?page=${page - 1}${query}`) : ''}${hasMore ? link(section, 'Volgende →', `?page=${page + 1}${query}`) : ''}</div>`
const pageNumber = () => Math.max(0, Math.min(10000, Number(new URLSearchParams(location.search).get('page')) || 0))
const searchText = value => String(value || '').trim().replace(/[%_\\]/g, '').slice(0, 100)

export function deniedAdmin() {
  document.querySelector('#app').innerHTML = safeHtml(`<main class="admin-denied"><p>403 · Geen toegang</p><h1>Deze beheerpagina is afgeschermd</h1><p>Je account heeft geen toestemming voor dit onderdeel.</p><a href="${appUrl('studio/dashboard')}">Naar mijn Studio</a><p><button type="button" id="denied-signout">Uitloggen</button></p></main>`)
  document.querySelector('#denied-signout').onclick = async () => { await supabase.auth.signOut(); location.assign(appUrl()) }
}
async function confirmAction(title, detail, withReason = false) {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = safeHtml(`<form method="dialog" class="admin-form"><h2>${esc(title)}</h2><p>${esc(detail)}</p>${withReason ? '<label>Reden<input name="reason" required minlength="3" maxlength="500"></label>' : ''}<div class="admin-actions"><button value="cancel" type="button" data-cancel>Annuleren</button><button class="admin-danger" value="confirm" type="submit">Bevestigen</button></div></form>`)
  document.querySelector('.admin-shell').append(dialog)
  return new Promise(resolve => {
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close('cancel')
    dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm' ? (withReason ? dialog.querySelector('input').value.trim() : true) : false; dialog.remove(); resolve(result) }, { once: true })
    dialog.showModal()
  })
}
function bindForm(selector, run) {
  const form = root.querySelector(selector)
  if (!form) return
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true
    try { await refreshAccess(); const values = Object.fromEntries([...new FormData(form)].map(([key,value])=>[key.replace(/^fvt_/,''),value])); await run(values, form); status('Opgeslagen.') }
    catch (error) { status(error.code ? friendlyError(error) : error.message || 'Opslaan mislukt.') }
    finally { if (button.isConnected) button.disabled = false }
  }
}
function bindAction(id, run) {
  const button = root.querySelector('#' + id)
  if (button) button.onclick = async () => { button.disabled = true; try { await run() } catch (e) { status(e.code ? friendlyError(e) : e.message) } finally { if (button.isConnected) button.disabled = false } }
}

export async function renderAdmin(route, session) {
  account = await refreshAccess()
  const section = route.split('/')[1] || 'dashboard'
  if (!canOpenAdmin(account, section)) return deniedAdmin()
  if (section === 'input' && !await featureAllowed('internal_data_entry')) return deniedAdmin()
  document.title = `FVT Admin · ${ADMIN_SECTIONS.find(([key]) => key === section)[1]}`
  document.querySelector('#app').innerHTML = safeHtml(`<div class="admin-shell"><aside class="admin-sidebar" id="admin-nav"><div class="admin-brand">FVT Admin<small>FANTASY STUDIO</small></div><nav aria-label="Admin Center">${ADMIN_SECTIONS.filter(([key]) => canOpenAdmin(account, key)).map(([key, label]) => `<a href="${appUrl('admin/' + key)}" ${key === section ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav><a href="${appUrl('studio/dashboard')}">← Mijn Studio</a><button type="button" id="admin-signout">Uitloggen</button></aside><main class="admin-main"><header class="admin-header"><div><span class="admin-kicker">FVT / ADMIN CENTER</span><h1>${esc(ADMIN_SECTIONS.find(([key]) => key === section)[1])}</h1><p>Dagelijks beheer van Fantasy Voetbal Talk</p></div><div class="admin-account">${account.roles.map(chip).join(' ')}</div><button class="admin-menu-toggle" id="admin-menu" aria-expanded="false" aria-controls="admin-nav">Menu</button></header><div id="admin-content" class="admin-content" role="status">Gegevens laden…</div><footer class="admin-footer">Fantasy Voetbal Talk · Beheeracties worden veilig vastgelegd.</footer></main></div>`)
  root = document.querySelector('#admin-content')
  document.querySelector('#admin-menu').onclick = event => { const open = document.querySelector('.admin-shell').classList.toggle('menu-open'); event.currentTarget.setAttribute('aria-expanded', String(open)) }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('.admin-shell')?.classList.remove('menu-open'); document.querySelector('#admin-menu')?.setAttribute('aria-expanded', 'false') } })
  document.querySelector('#admin-signout').onclick = async () => { await supabase.auth.signOut(); location.assign(appUrl()) }
  try {
    const loaders = { dashboard, nieuws: articles, videos, community, users, features, studio: features, photos, sync, data: dataPage, audit, system, input }
    await loaders[section](session)
  } catch (error) { html(card('Gegevens konden niet worden geladen', `<p>${esc(friendlyError(error))}</p><button id="admin-retry">Opnieuw proberen</button>`)); bindAction('admin-retry', () => location.reload()) }
}
async function dashboard() {
  const metrics = []
  for (const [permission, label, name, filter] of [ ['articles.read', 'Conceptartikelen', 'news_articles', ['status', 'draft']], ['articles.read', 'Gepubliceerd', 'news_articles', ['status', 'published']], ['forum.moderate', 'Communitytopics', 'forum_topics'], ['users.view', 'Gebruikers', 'profiles'] ]) {
    if (!allowed(permission)) continue
    let query = supabase.from(name).select('id', { count: 'exact', head: true }); if (filter) query = query.eq(...filter)
    const result = await query
    metrics.push(`<div class="admin-card admin-metric"><span>${label}</span><strong>${result.error ? '—' : result.count}</strong>${result.error ? blank('Geen gegevens beschikbaar') : ''}</div>`)
  }
  html(`<div class="admin-metrics">${metrics.join('')}</div>${card('Jouw werkruimte', `<p class="admin-muted">Je ziet de onderdelen waarvoor je account rechten heeft.</p><div class="admin-actions">${ADMIN_SECTIONS.filter(([key]) => key !== 'dashboard' && canOpenAdmin(account, key)).map(([key, label]) => link(key, label)).join('')}</div>`)}<div id="dashboard-details"></div>`)
  const details = root.querySelector('#dashboard-details'); let markup = ''
  if (allowed('forum.moderate')) { const rows = unwrap(await supabase.from('forum_topics').select('id,title,author_name,last_activity_at,hidden').order('last_activity_at', { ascending: false }).limit(5)); markup += card('Recente communityactiviteit', rows.map(r => `<p>${link('community', r.title, '?topic=' + r.id)} · ${esc(r.author_name)} · ${date(r.last_activity_at)}</p>`).join('') || blank()) }
  if (allowed('sync.view')) { const rows = unwrap(await supabase.from('prominent_sync_runs').select('status,started_at,processed,errors').order('started_at', { ascending: false }).limit(1)); markup += card('Laatste ESPN-synchronisatie', rows.map(r => `<p>${chip(r.status)} · ${date(r.started_at)} · ${r.processed} verwerkt · ${r.errors} fouten</p>`).join('') || blank()) }
  if (allowed('audit.view')) { const rows = unwrap(await supabase.from('admin_audit_log').select('action,created_at,target_type').order('created_at', { ascending: false }).limit(5)); markup += card('Laatste beheeracties', rows.map(r => `<p>${esc(r.action)} · ${date(r.created_at)}</p>`).join('') || blank()) }
  if (allowed('users.view')) { const rows = unwrap(await supabase.from('profiles').select('display_name,created_at').order('created_at', { ascending: false }).limit(5)); markup += card('Recente gebruikers', rows.map(r => `<p>${esc(r.display_name || 'FVT-lid')} · ${date(r.created_at)}</p>`).join('') || blank()) }
  details.innerHTML = safeHtml(markup)
}
async function articles(session) {
  const { renderArticles } = await import('./cms.js')
  await renderArticles({ root, account, session, confirmAction })
}
export function youtubeId(value) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) return null; const id = url.hostname === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})(?:\/|$)/)?.[1]; return /^[\w-]{11}$/.test(id || '') ? id : null } catch { return null }
}
async function videos(session) {
  const { renderVideos } = await import('./cms.js')
  await renderVideos({ root, account, session, confirmAction, youtubeId })
}
async function community() {
  const params = new URLSearchParams(location.search), page = pageNumber(), topic = params.get('topic'), categories = unwrap(await supabase.from('forum_categories').select('*').order('position'))
  const q = searchText(params.get('q')), category = params.get('category') || ''
  let query = supabase.from('forum_topics').select('*').order('last_activity_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  if (q) query = query.ilike('title', '%' + q + '%'); if (category) query = query.eq('category_id', category)
  const rows = unwrap(await query)
  html(card('Topics', `<form class="admin-filters" method="get">${field('Zoeken', 'q', q, 'type="search"')}${select('Categorie', 'category', [['', 'Alle categorieën'], ...categories.map(c => [c.id, c.name])], category)}<button>Filteren</button></form>${table(['Topic', 'Auteur', 'Status', 'Actie'], rows.slice(0, PAGE_SIZE).map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.author_name)}</td><td>${t.pinned ? chip('pinned') : ''} ${t.closed ? chip('locked') : ''} ${t.hidden ? chip('hidden') : ''}</td><td>${link('community', 'Modereren', '?topic=' + t.id)}</td></tr>`).join(''))}${pageNavigation('community', page, rows.length > PAGE_SIZE, '&q=' + encodeURIComponent(q) + '&category=' + encodeURIComponent(category))}`) + '<div id="topic-detail"></div><p data-status class="admin-status" aria-live="polite"></p>')
  if (topic) {
    const t = unwrap(await supabase.from('forum_topics').select('*').eq('id', topic).single()), postPage = Math.max(0, Number(params.get('posts')) || 0), posts = unwrap(await supabase.from('forum_posts').select('*').eq('topic_id', topic).order('created_at').order('id').range(postPage * PAGE_SIZE, (postPage + 1) * PAGE_SIZE))
    root.querySelector('#topic-detail').innerHTML = safeHtml(card(t.title, `<p>${esc(t.author_name)} · gebruiker ${esc(t.user_id)} · ${date(t.created_at)}</p><div class="admin-preview">${esc(t.body)}</div><div class="admin-actions">${action(t.pinned ? 'Losmaken' : 'Vastzetten', 'topic-pin', 'forum.pin')}${action(t.closed ? 'Heropenen' : 'Sluiten', 'topic-lock', 'forum.lock')}${action(t.hidden ? 'Zichtbaar maken' : 'Verbergen', 'topic-hide', 'forum.moderate')}${action('Topic verwijderen', 'topic-delete', 'forum.delete', true)}</div>${allowed('forum.manage_categories') ? `<form id="topic-category" class="admin-filters">${select('Categorie wijzigen', 'category', categories.map(c => [c.id, c.name]), t.category_id)}<button type="submit">Wijzigen</button></form>` : ''}`) + card('Reacties', posts.slice(0, PAGE_SIZE).map(p => `<article class="admin-card"><p>${esc(p.author_name)} · ${esc(p.user_id)} · ${date(p.created_at)} ${p.hidden ? chip('hidden') : ''}</p><div class="admin-preview">${esc(p.body)}</div><div class="admin-actions"><button data-post="${p.id}" data-operation="${p.hidden ? 'show' : 'hide'}">${p.hidden ? 'Zichtbaar maken' : 'Verbergen'}</button>${allowed('forum.delete') ? `<button class="admin-danger" data-post="${p.id}" data-operation="delete">Verwijderen</button>` : ''}</div></article>`).join('') || blank()) + `<div class="admin-actions">${postPage ? link('community', 'Vorige reacties', `?topic=${topic}&posts=${postPage - 1}`) : ''}${posts.length > PAGE_SIZE ? link('community', 'Meer reacties', `?topic=${topic}&posts=${postPage + 1}`) : ''}</div>`)
    const moderate = async (target_table, target, operation, category = null) => { const reason = await confirmAction('Moderatie bevestigen', 'Deze actie wordt met je reden vastgelegd.', true); if (!reason) return; unwrap(await supabase.rpc('admin_moderate_content', { target_table, target, operation, reason, category })); location.reload() }
    bindAction('topic-pin', async () => { if (!await confirmAction('Vastzetten wijzigen', t.title)) return; unwrap(await supabase.rpc('moderate_forum_topic', { topic, is_pinned: !t.pinned, is_closed: t.closed })); location.reload() })
    bindAction('topic-lock', async () => { if (!await confirmAction('Topicstatus wijzigen', t.title)) return; unwrap(await supabase.rpc('moderate_forum_topic', { topic, is_pinned: t.pinned, is_closed: !t.closed })); location.reload() })
    bindAction('topic-hide', () => moderate('forum_topics', topic, t.hidden ? 'show' : 'hide'))
    bindAction('topic-delete', () => moderate('forum_topics', topic, 'delete'))
    bindForm('#topic-category', values => moderate('forum_topics', topic, 'category', values.category))
    root.querySelectorAll('[data-post]').forEach(button => button.onclick = async () => { try { await moderate('forum_posts', button.dataset.post, button.dataset.operation) } catch (e) { status(friendlyError(e)) } })
  }
  if (allowed('forum.manage_categories')) { root.insertAdjacentHTML('beforeend', safeHtml(card('Categorie toevoegen', '<form id="category-form" class="admin-form">' + field('Naam', 'name', '', 'required minlength="2" maxlength="80"') + field('Beschrijving', 'description', '', 'maxlength="300"') + '<button type="submit">Toevoegen</button></form>'))); bindForm('#category-form', async values => { unwrap(await supabase.from('forum_categories').insert(values)); location.reload() }) }
}
async function users() {
  const page = pageNumber(), params = new URLSearchParams(location.search), q = searchText(params.get('q'))
  let query = supabase.from('profiles').select('id,display_name,favorite_club,account_status,created_at,user_roles:user_roles!user_roles_user_id_fkey(role_key)').order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  if (q) query = query.ilike('display_name', '%' + q + '%')
  const rows = unwrap(await query), id = params.get('user')
  html(card('Gebruikers', `<form class="admin-filters" method="get">${field('Zoek weergavenaam', 'q', q, 'type="search"')}<button>Zoeken</button></form>${table(['Naam', 'Club', 'Rollen', 'Status', 'Aangemaakt', 'Actie'], rows.slice(0, PAGE_SIZE).map(u => `<tr><td>${esc(u.display_name || 'FVT-lid')}</td><td>${esc(u.favorite_club || '—')}</td><td>${u.user_roles.map(r => chip(r.role_key)).join(' ')}</td><td>${chip(u.account_status)}</td><td>${date(u.created_at)}</td><td>${link('users', 'Rechten bekijken', '?user=' + u.id)}</td></tr>`).join(''))}${pageNavigation('users', page, rows.length > PAGE_SIZE, '&q=' + encodeURIComponent(q))}<p class="admin-muted">E-mail en laatste login worden niet opgehaald uit Auth. Geen sessies of tokens worden getoond.</p>`))
  if (!id) return
  const user = unwrap(await supabase.from('profiles').select('id,display_name,account_status,user_roles:user_roles!user_roles_user_id_fkey(role_key)').eq('id', id).single()), roles = unwrap(await supabase.from('roles').select('*').order('key'))
  permissionMap = unwrap(await supabase.from('role_permissions').select('*'))
  const allPermissions = unwrap(await supabase.from('permissions').select('key').order('key')), current = user.user_roles.map(r => r.role_key)
  root.insertAdjacentHTML('beforeend', safeHtml(card('Rechten · ' + (user.display_name || user.id), `<form id="roles-form" class="admin-form"><div class="admin-checks">${roles.map(r => check(r.label, 'role_' + r.key, current.includes(r.key))).join('')}</div><div id="permissions-preview"></div>${allowed('users.manage_roles') ? '<button type="submit">Rollen wijzigen</button>' : ''}<p data-status class="admin-status" aria-live="polite"></p></form>${action(user.account_status === 'blocked' ? 'Deblokkeren' : 'Blokkeren', 'user-status', 'users.manage_status', true)}`)))
  const selected = () => [...root.querySelectorAll('#roles-form input:checked')].map(i => i.name.slice(5))
  const showPermissions = () => { const permissions = new Set(permissionMap.filter(r => selected().includes(r.role_key)).map(r => r.permission_key)); root.querySelector('#permissions-preview').innerHTML = safeHtml(`<p>Toegang na deze wijziging:</p>${table(['Permissie', 'Toegestaan'], allPermissions.map(p => `<tr><td>${esc(p.key)}</td><td>${permissions.has(p.key) ? '✓ Ja' : '✕ Nee'}</td></tr>`).join(''))}`) }
  root.querySelectorAll('#roles-form input').forEach(i => { i.onchange = showPermissions; i.disabled = !allowed('users.manage_roles') }); showPermissions()
  bindForm('#roles-form', async () => { const requested = selected(); if (!requested.length) throw Error('Selecteer minimaal één rol.'); const reason = await confirmAction('Rollen wijzigen', `${current.join(' + ')} → ${requested.join(' + ')}. Controleer het permissieoverzicht. Je kunt je eigen rollen niet wijzigen.`, true); if (!reason) return; unwrap(await supabase.rpc('admin_assign_roles', { target: id, requested, reason })); location.reload() })
  bindAction('user-status', async () => { const reason = await confirmAction('Accountstatus wijzigen', 'Blokkeren stopt accountwrites en beheerrechten, ook met een bestaande login.', true); if (!reason) return; unwrap(await supabase.rpc('admin_manage_status', { target: id, new_status: user.account_status === 'blocked' ? 'active' : 'blocked', reason })); location.reload() })
}
async function features() {
  const rows = unwrap(await supabase.from('site_features').select('*').order('label'))
  html(rows.map(f => card(f.label, `<p>${esc(f.description)}</p><p><code>${esc(f.route)}</code> · ${chip(f.visibility)}</p><form data-feature="${esc(f.key)}" class="admin-form"><div class="admin-grid">${check('Ingeschakeld', 'enabled', f.enabled)}${select('Doelgroep', 'visibility', ['public', 'member', 'staff', 'admin', 'hidden'], f.visibility)}${field('Vereiste permissie (optioneel)', 'required_permission', f.required_permission)}${field('Onderhoudsbericht', 'maintenance_message', f.maintenance_message, 'maxlength="500"')}</div>${allowed('features.manage') ? '<button type="submit">Wijziging opslaan</button>' : ''}<small>Laatste wijziging: ${date(f.updated_at)}</small></form>`)).join('') + '<p data-status class="admin-status" aria-live="polite"></p>')
  root.querySelectorAll('[data-feature]').forEach(form => { if (!allowed('features.manage')) { form.querySelectorAll('input,select').forEach(i => i.disabled = true); return } form.onsubmit = async event => { event.preventDefault(); const f = rows.find(r => r.key === form.dataset.feature), values = Object.fromEntries(new FormData(form)), button = form.querySelector('button'); if (!await confirmAction('Zichtbaarheid wijzigen', `${f.label}: ${values.visibility}, ${form.elements.enabled.checked ? 'aan' : 'uit'}. Dit geldt direct voor bezoekers en data-aanvragen.`)) return; button.disabled = true; try { unwrap(await supabase.from('site_features').update({ enabled: form.elements.enabled.checked, visibility: values.visibility, required_permission: values.required_permission || null, maintenance_message: values.maintenance_message }).eq('key', f.key).eq('updated_at', f.updated_at).select('key').single()); location.reload() } catch (e) { status(friendlyError(e)) } finally { button.disabled = false } } })
}
async function photos() {
  const q = searchText(new URLSearchParams(location.search).get('q')), page = pageNumber()
  const rows = unwrap(await supabase.rpc('admin_player_photos', {query_text:q,start_offset:page*PAGE_SIZE}))
  const { candidatesForKey, setPlayerPhotoRecords } = await import('../services/playerPhotos.js'); setPlayerPhotoRecords(rows)
  html(card('Centrale spelersfoto’s', `<p class="admin-muted">Zoek op spelersnaam, club of centrale speler-ID. De bron en lokale fallback worden door de bestaande fotoservice bepaald.</p><form class="admin-filters" method="get">${field('Spelersnaam / club / ID', 'q', q, 'type="search"')}<button>Zoeken</button></form>${rows.slice(0, PAGE_SIZE).map(r => { const candidates = candidatesForKey(r.player_key, 72), chosen = candidates[0]; return `<article class="admin-card"><h3>${esc(r.display_name || r.player_key)}</h3><p>${esc(r.club || "")} · ${esc(r.player_key)}</p>${chosen ? `<img class="admin-photo" src="${esc(chosen.url)}" alt="Huidige spelersfoto">` : ''}<p>Bron: ${esc(r.source_name || 'Geen gegevens')} · ${chip(r.source_status)} · Fallback: ${esc(candidates.find(c => c.source === 'local')?.url || 'Initialen')}</p><form data-photo="${esc(r.player_key)}" class="admin-form">${field('Override URL', 'override_url', r.override_url, 'type="url" pattern="https://.*" maxlength="2000"')}${check('Override actief', 'override_enabled', r.override_enabled)}${allowed('player_photos.manage') ? '<div class="admin-actions"><button type="submit">Opslaan</button><button type="button" data-clear-photo>Override verwijderen</button></div>' : ''}</form></article>` }).join('') || blank()}${pageNavigation('photos', page, rows.length > PAGE_SIZE, '&q=' + encodeURIComponent(q))}<p data-status class="admin-status" aria-live="polite"></p>`))
  root.querySelectorAll('[data-photo]').forEach(form => { const record = rows.find(r => r.player_key === form.dataset.photo); const save = async clear => { if (!await confirmAction('Foto-override wijzigen', record.player_key)) return; unwrap(await supabase.rpc('admin_set_photo_override', {target_key:record.player_key,photo_url:clear?null:form.elements.override_url.value||null,is_enabled:clear?false:form.elements.override_enabled.checked,expected_updated_at:record.updated_at||null})); location.reload() }; form.onsubmit = async e => { e.preventDefault(); try { await save(false) } catch (err) { status(friendlyError(err)) } }; const clear = form.querySelector('[data-clear-photo]'); if (clear) clear.onclick = async () => { try { await save(true) } catch (err) { status(friendlyError(err)) } } })
}
async function sync() {
  const runs = unwrap(await supabase.from('prominent_sync_runs').select('id,status,started_at,finished_at,processed,errors,pending').order('started_at', { ascending: false }).limit(30)), jobs = unwrap(await supabase.from('prominent_sync_jobs').select('prominent_id,season,event,status,attempts,next_retry_at,last_error').eq('status', 'error').order('updated_at', { ascending: false }).limit(30))
  html(card('ESPN · prominenten', `${allowed('sync.run') ? '<button type="button" id="sync-run" class="admin-primary">Synchronisatie starten</button>' : ''}<p data-status class="admin-status" aria-live="polite"></p>${table(['Start', 'Status', 'Verwerkt', 'Fouten', 'Wachtend'], runs.map(r => `<tr><td>${date(r.started_at)}</td><td>${chip(r.status)}</td><td>${r.processed}</td><td>${r.errors}</td><td>${r.pending}</td></tr>`).join(''))}`) + card('Recente fouten', table(['Seizoen', 'Ronde', 'Pogingen', 'Retry', 'Fout'], jobs.map(j => `<tr><td>${esc(j.season)}</td><td>${j.event}</td><td>${j.attempts}</td><td>${date(j.next_retry_at)}</td><td>${esc(j.last_error)}</td></tr>`).join(''))))
  bindAction('sync-run', async () => { if (!await confirmAction('ESPN-sync starten', 'De bestaande veilige synchronisatiefunctie verwerkt één begrensde batch.')) return; status('Synchronisatie gestart…'); const result = unwrap(await supabase.functions.invoke('prominent-sync', { body: {} })); status(`${result.processed || 0} verwerkt · ${result.errors || 0} fouten · ${result.pending || 0} wachtend`) })
}
async function dataPage() {
  const imports = unwrap(await supabase.from('reference_imports').select('id,source,created_at,counts').order('created_at', { ascending: false }).limit(30))
  html(card('Gedeelde voetbaldata', table(['Bron', 'Importdatum', 'Records'], imports.map(r => `<tr><td>${esc(r.source)}</td><td>${date(r.created_at)}</td><td><pre>${esc(JSON.stringify(r.counts, null, 2))}</pre></td></tr>`).join(''))) + card('Datacorrectie', `<p>Handmatige correcties gebruiken de bestaande invoermodule. Die slaat lokale Studio-data op; gedeelde referentiedata wordt alleen via een gecontroleerde import gepubliceerd.</p>${allowed('data.correct') ? link('input', 'Open interne invoer') : ''}${allowed('sync.run') && allowed('data.correct') ? '<p><button id="reference-sync" type="button">Google Sheets importeren</button></p>' : ''}<p data-status class="admin-status" aria-live="polite"></p>`))
  bindAction('reference-sync', async () => { if (!await confirmAction('Referentiedata importeren', 'De bestaande Google Sheets-import vervangt de gedeelde datasets atomair.')) return; status('Data synchroniseren…'); const database = await import('../services/database.js'); await database.initializeDatabase(); await database.synchronizeDatabase(); status('Import voltooid. De server heeft de wijziging gelogd.') })
}
async function audit() {
  const page = pageNumber(), rows = unwrap(await supabase.from('admin_audit_log').select('id,actor_user_id,action,target_type,target_id,metadata,created_at').order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
  html(card('Auditlog · alleen lezen', table(['Tijd', 'Actor', 'Actie', 'Doel', 'Details'], rows.slice(0, PAGE_SIZE).map(r => `<tr><td>${date(r.created_at)}</td><td>${esc(r.actor_user_id || 'Systeem')}</td><td>${esc(r.action)}</td><td>${esc(r.target_type)}<br>${esc(r.target_id)}</td><td><pre>${esc(JSON.stringify(r.metadata, null, 2))}</pre></td></tr>`).join('')) + pageNavigation('audit', page, rows.length > PAGE_SIZE)))
}
async function system() {
  html(card('Beveiliging en infrastructuur', `<p>Supabase Auth · centrale databasepermissions · RLS · append-only auditlog</p><p>Je actuele rollen: ${account.roles.map(chip).join(' ')}</p><p class="admin-muted">Kritieke rolwijzigingen vereisen een super-admin. Zelfpromotie en het verwijderen of blokkeren van de laatste actieve super-admin zijn server-side verboden.</p>${allowed('system.manage') ? '<p>Je hebt kritieke systeemrechten. De eerste super-adminbootstrap staat in de release-instructie; infrastructuurcredentials worden hier niet getoond.</p>' : ''}`))
}
async function input() {
  await import('../style.css')
  const database = await import('../services/database.js'); await database.initializeDatabase()
  const module = await import('../modules/input.js')
  html(card('Interne Studio-invoer', `<p class="admin-muted">Bestaande invoerfunctionaliteit. Correcties zijn lokaal; publiceer gedeelde data via Data.</p>${module.createInputScreen()}`))
  await module.mountInputScreen()
}
