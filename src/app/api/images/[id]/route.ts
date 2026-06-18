import { NextResponse, type NextRequest } from "next/server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { deleteLocalUserImage } from "@/lib/local-db";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

type ImageRouteProps = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: NextRequest, { params }: ImageRouteProps) {
  if (!hasSupabaseEnv()) {
    const profile = getDemoProfileFromCookie();
    if (!profile) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    try {
      deleteLocalUserImage(params.id, profile.id);
      return NextResponse.json({ message: "图片已删除。" });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "图片删除失败。" }, { status: 400 });
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

  const { data: image } = await service
    .from("generated_images")
    .select("id,user_id")
    .eq("id", params.id)
    .single();

  if (!image || image.user_id !== user.id) {
    return NextResponse.json({ error: "图片不存在或无权删除。" }, { status: 404 });
  }

  await service.from("generation_tasks").delete().eq("image_id", params.id);
  const { error } = await service.from("generated_images").delete().eq("id", params.id).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "图片已删除。" });
}
