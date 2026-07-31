import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials are not configured yet. The app will run in a limited mode until you add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env."
  );
}

export const supabase = createClient(supabaseUrl || "https://example.supabase.co", supabaseAnonKey || "public-anon-key");
