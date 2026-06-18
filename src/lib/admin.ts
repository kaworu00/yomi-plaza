import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export async function requireAdmin() {
  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  if (!supabase || !service) {
    return { error: "Supabase is not configured.", status: 501 as const };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: profile } = await service.from("profiles").select("*").eq("id", user.id).single();

  if (!profile || profile.role !== "admin") {
    return { error: "Admin permission required.", status: 403 as const };
  }

  return { service, user, profile };
}
