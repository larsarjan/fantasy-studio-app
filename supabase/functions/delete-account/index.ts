import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createAccountDeletionHandler } from '../../../src/services/accountDeletion.js'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createAccountDeletionHandler({
  db,
  origins: ['https://fantasyvoetbaltalk.nl', 'https://www.fantasyvoetbaltalk.nl', 'https://fantasy-studio-app.vercel.app', 'http://127.0.0.1:5180', 'http://localhost:5173'],
  log: event => console.info(JSON.stringify(event)),
}))
