// The admin panel uses the same login as the website: one account per verified mobile.
// Admin rights come from the database (is_admin()), never from this file.
export { supabase as adminSupabase } from '../lib/supabase'
