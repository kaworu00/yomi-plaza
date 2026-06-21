import { NextResponse, type NextRequest } from "next/server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { readLocalDb } from "@/lib/local-db";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  const sinceTime = since ? Date.parse(since) : Number.NaN;
  const cutoff = Number.isFinite(sinceTime) ? new Date(sinceTime - 30_000).toISOString() : null;

  if (!hasSupabaseEnv()) {
    const profile = getDemoProfileFromCookie();
    if (!profile) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const tasks = readLocalDb()
      .tasks.filter((task) => task.user_id === profile.id)
      .filter((task) => !cutoff || task.created_at >= cutoff)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 5);

    return NextResponse.json({ tasks });
  }

  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  if (!supabase || !service) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 501 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let query = service
    .from("generation_tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (cutoff) {
    query = query.gte("created_at", cutoff);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}
