import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const isSupabaseClientConfigured = Boolean(supabaseUrl && supabaseAnonKey)
const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceKey)

function createMissingSupabaseClient(name: string) {
    return new Proxy(
        {},
        {
            get() {
                throw new Error(
                    `${name} is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the appropriate key(s): NEXT_PUBLIC_SUPABASE_ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY.`
                )
            },
        }
    )
}

// Client for browser/frontend use
export const supabase = isSupabaseClientConfigured
    ? createClient(supabaseUrl as string, supabaseAnonKey as string)
    : (createMissingSupabaseClient('supabase') as ReturnType<typeof createClient>)

// Admin client with service role for backend operations
export const supabaseAdmin = isSupabaseAdminConfigured
    ? createClient(supabaseUrl as string, supabaseServiceKey as string, {
          auth: {
              autoRefreshToken: false,
              persistSession: false,
          },
      })
    : (createMissingSupabaseClient('supabaseAdmin') as ReturnType<typeof createClient>)

export default supabase
