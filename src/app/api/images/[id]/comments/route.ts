import { NextResponse, type NextRequest } from "next/server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createLocalImageComment, getLocalImageComments } from "@/lib/local-db";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";
import type { GalleryComment } from "@/lib/types";

type CommentRouteProps = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, { params }: CommentRouteProps) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ comments: getLocalImageComments(params.id) });
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 501 });
  }

  const { data: image } = await service
    .from("generated_images")
    .select("id")
    .eq("id", params.id)
    .eq("is_public", true)
    .single();

  if (!image) {
    return NextResponse.json({ comments: [] });
  }

  const { data, error } = await service
    .from("gallery_comments")
    .select("id,image_id,user_id,body,created_at,profiles(display_name,email,avatar_url)")
    .eq("image_id", params.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: toGalleryComments(data ?? []) });
}

export async function POST(request: NextRequest, { params }: CommentRouteProps) {
  const body = (await request.json()) as { body?: string };
  const text = body.body?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "评论不能为空。" }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    try {
      const profile = getDemoProfileFromCookie();
      const comment = createLocalImageComment(params.id, text, profile?.id ?? null);
      return NextResponse.json({ comment });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "评论发布失败。" }, { status: 400 });
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
    return NextResponse.json({ error: "请先登录后评论。" }, { status: 401 });
  }

  const { data: image } = await service
    .from("generated_images")
    .select("id")
    .eq("id", params.id)
    .eq("is_public", true)
    .single();

  if (!image) {
    return NextResponse.json({ error: "图片不存在或尚未公开。" }, { status: 404 });
  }

  const { data, error } = await service
    .from("gallery_comments")
    .insert({
      image_id: params.id,
      user_id: user.id,
      body: text.slice(0, 500)
    })
    .select("id,image_id,user_id,body,created_at,profiles(display_name,email,avatar_url)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "评论发布失败。" }, { status: 400 });
  }

  return NextResponse.json({ comment: toGalleryComments([data])[0] });
}

function toGalleryComments(
  rows: Array<{
    id: string;
    image_id: string;
    user_id: string | null;
    body: string;
    created_at: string;
    profiles: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
  }>
) {
  return rows.map((row) => ({
    id: row.id,
    image_id: row.image_id,
    user_id: row.user_id,
    author_name: row.profiles?.display_name ?? row.profiles?.email ?? "访客",
    author_avatar_url: row.profiles?.avatar_url ?? null,
    body: row.body,
    created_at: row.created_at
  })) satisfies GalleryComment[];
}
