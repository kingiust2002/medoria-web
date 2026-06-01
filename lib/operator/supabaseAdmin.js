// lib/operator/supabaseAdmin.js — SERVER ONLY
// Service-role Supabase client. Bypasses RLS, so it must NEVER reach the browser.
// `import "server-only"` makes the build fail if this is ever pulled into a
// Client Component bundle. Used only by server actions / route handlers / server
// components in the operator panel.
import "server-only";
import { createClient } from "@supabase/supabase-js";

let _admin = null;

export function isAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Returns the service-role client, or null if not configured (callers handle it).
export function getAdminClient() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
