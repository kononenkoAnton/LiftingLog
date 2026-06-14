import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Null when env isn't configured (e.g. local dev without .env) — the app then
// falls back to localStorage and skips auth. The anon/publishable key is
// public-safe; Row-Level Security protects the data.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null
