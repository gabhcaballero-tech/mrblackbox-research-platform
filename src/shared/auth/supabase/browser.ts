"use client";

import { createBrowserClient } from "@supabase/ssr";

function getSupabaseBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase public environment variables are required.");
  }

  return { supabasePublishableKey, supabaseUrl };
}

export function createBrowserSupabaseClient() {
  const { supabasePublishableKey, supabaseUrl } = getSupabaseBrowserConfig();

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
