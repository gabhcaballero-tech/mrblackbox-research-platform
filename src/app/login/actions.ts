"use server";

import { redirect } from "next/navigation";
import { sanitizeInternalNextPath } from "@/shared/auth/routes";
import { createServerSupabaseClient } from "@/shared/auth/supabase/server";

function loginPathWithError(nextPath: string) {
  return `/login?error=credentials&next=${encodeURIComponent(nextPath)}`;
}

export async function signInWithPasswordAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeInternalNextPath(formData.get("next"));

  if (!email || !password) {
    redirect(loginPathWithError(nextPath));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(loginPathWithError(nextPath));
  }

  redirect(nextPath);
}
