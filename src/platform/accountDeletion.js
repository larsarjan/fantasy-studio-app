import { supabase, appUrl } from './client.js'
export function accountDeletionMarkup() {
  return `<section class="account-danger" aria-labelledby="delete-account-heading"><h3 id="delete-account-heading">Account verwijderen</h3><p>Dit is definitief. Je profiel, selectie, opgeslagen plannen, voorkeuren, privénotities en persoonlijke uploads worden verwijderd.</p><p>Openbare topics en reacties blijven staan onder <strong>Verwijderd account</strong>, zodat reacties van anderen behouden blijven. De inhoud en tijdstempels blijven zichtbaar: verwijder eventuele persoonlijke informatie in je berichten vooraf. Redactionele artikelen en afbeeldingen blijven zonder jouw accountkoppeling bewaard. Beveiligingslogs bewaren alleen noodzakelijke actiegegevens.</p><details><summary>Ik wil mijn account definitief verwijderen</summary><form id="delete-account-form"><label for="delete-account-confirmation">Typ VERWIJDER ter bevestiging</label><input id="delete-account-confirmation" name="confirmation" autocomplete="off" spellcheck="false" pattern="VERWIJDER" required><button type="submit" class="account-delete-button" disabled>Account definitief verwijderen</button><p id="delete-account-status" role="status" aria-live="polite"></p></form></details></section>`
}
export function mountAccountDeletion() {
  const form = document.querySelector('#delete-account-form')
  if (!form) return
  const input = form.querySelector('input'), button = form.querySelector('button'), status = form.querySelector('[role=status]')
  let busy = false
  input.oninput = () => { button.disabled = busy || input.value !== 'VERWIJDER' }
  form.onsubmit = async event => {
    event.preventDefault()
    if (busy || input.value !== 'VERWIJDER') return
    busy = true; button.disabled = true; status.textContent = 'Je account wordt veilig verwijderd. Laat dit venster open.'
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirmation: input.value } })
      let code = data?.code
      if (error?.context instanceof Response) { try { code = (await error.context.json()).code } catch { /* Generic failure below. */ } }
      if (error || code !== 'deleted') {
        status.textContent = code === 'last_admin' ? 'Je bent de laatste beheerder. Draag eerst het beheer over aan een andere beheerder.' : code === 'in_progress' ? 'Je verwijdering wordt al verwerkt. Wacht even en herlaad daarna de pagina.' : ['unauthorized','session_required'].includes(code) ? 'Log opnieuw in voordat je je account verwijdert. Als een eerdere verwijdering al is voltooid, bestaat dit account niet meer.' : 'Je accountverwijdering is niet afgerond. Sommige bestanden kunnen al zijn opgeruimd. Log zo nodig opnieuw in en probeer het nogmaals.'
        return
      }
      window.dispatchEvent(new Event('studio:account-deleted'))
      await supabase.auth.signOut({ scope: 'local' })
      location.replace(appUrl())
    } catch { status.textContent = 'Geen bevestiging ontvangen. Controleer je verbinding. Log opnieuw in om te controleren of je account nog bestaat; een afgeronde verwijdering is definitief.' }
    finally { busy = false; button.disabled = input.value !== 'VERWIJDER' }
  }
}
