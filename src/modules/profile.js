import { profile, saveProfile } from '../platform/repository.js'
import { friendlyError } from '../platform/client.js'
import { getFixtures } from '../services/database.js'
import { canonicalClubs, canonicalFavorite } from '../services/canonicalClubs.js'
import { esc } from './selection.js'

let account = null
export function setProfileAccount(user) { account = user }
export const profileName = () => profile?.display_name?.trim() || 'Mijn profiel'
export const initials = () => profileName().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toLocaleUpperCase('nl')
export function createProfileScreen() {
  const clubs = canonicalClubs(getFixtures())
  return `<section class="panel personal-studio personal-profile"><span class="eyebrow">Jouw FVT-identiteit</span><h2>Mijn profiel</h2><div class="profile-identity"><span class="profile-avatar">${esc(initials())}</span><div><h3>${esc(profileName())}</h3><p>${esc(account?.email)}</p><small>${account?.email_confirmed_at?'E-mailadres bevestigd':'E-mailadres nog niet bevestigd'}</small></div></div><p>Je weergavenaam verschijnt bij jouw forumberichten. Je e-mailadres en selectie blijven privé.</p><form id="profile-form"><label>Weergavenaam<input id="profile-display-name" maxlength="80" required autocomplete="nickname" value="${esc(profile?.display_name)}"></label><label>Favoriete club <small>Optioneel</small><select id="profile-favorite-club"><option value="">Geen voorkeur</option>${clubs.map(club=>`<option ${club===canonicalFavorite(profile?.favorite_club,clubs)?'selected':''}>${esc(club)}</option>`).join('')}</select></label><label>E-mailadres<input type="email" readonly value="${esc(account?.email)}"></label><p>Lid sinds ${profile?.created_at?esc(new Date(profile.created_at).toLocaleDateString('nl-NL')):'—'}</p><button class="platform-primary" type="submit">Profiel opslaan</button><p id="profile-status" role="status"></p></form><a href="/studio/settings">Account en instellingen</a></section>`
}
export function mountProfileScreen() {
  document.querySelector('#profile-form').onsubmit = async e => {
    e.preventDefault(); const button=e.currentTarget.querySelector('button'),status=document.querySelector('#profile-status')
    button.disabled=true
    try { const name=document.querySelector('#profile-display-name').value.trim();if(!name)throw new Error('empty');await saveProfile({displayName:name,favoriteClub:document.querySelector('#profile-favorite-club').value});status.textContent='Je profiel is opgeslagen.';document.querySelector('.profile-identity h3').textContent=profileName();document.querySelector('.profile-identity .profile-avatar').textContent=initials() }
    catch(error){status.textContent=friendlyError(error)}finally{button.disabled=false}
  }
}
