import { NextResponse, type NextRequest } from "next/server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { updateLocalProfile } from "@/lib/local-db";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

type ProfileBody = {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string;
};

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as ProfileBody;

  if (!hasSupabaseEnv()) {
    const profile = getDemoProfileFromCookie();
    if (!profile) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    try {
      const updated = updateLocalProfile(profile.id, body);
      return NextResponse.json({ profile: updated });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "资料保存失败。" }, { status: 400 });
    }
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
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const patch = {
    display_name: body.displayName?.trim().slice(0, 32),
    avatar_url: body.avatarUrl || null,
    bio: body.bio?.trim().slice(0, 120)
  };

  const { data, error } = await service.from("profiles").update(patch).eq("id", user.id).select("*").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
