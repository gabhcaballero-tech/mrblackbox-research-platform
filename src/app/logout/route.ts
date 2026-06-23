import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/auth/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url));
}
