// ============================================================
// CONFIG SUPABASE
// ============================================================
const SUPABASE_URL = 'https://gtcybiuxdpxixdjnshty.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0Y3liaXV4ZHB4aXhkam5zaHR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTU1MTgsImV4cCI6MjEwMDIzMTUxOH0.WwLPJlLsJtykl3hxGc9y-nl2NvAzoCFLcl4c5c1t68k'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const supabaseAuxClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
