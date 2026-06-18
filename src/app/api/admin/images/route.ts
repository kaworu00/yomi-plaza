import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { setLocalImageVisibility } from "@/lib/local-db";

type ImageBody = {
  imageId?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ImageBody;
  if (!body.imageId) {
    return NextResponse.json({ error: "imageId is required." }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      setLocalImageVisibility(body.imageId, Boolean(body.isPublic), Boolean(body.isFeatured));
      return NextResponse.json({ message: "图片精选状态已更新。" });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "图片更新失败。" }, { status: 400 });
    }
  }

  const admin = await requireAdmin();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { error } = await admin.service
    .from("generated_images")
    .update({
      is_public: Boolean(body.isPublic),
      is_featured: Boolean(body.isFeatured)
    })
    .eq("id", body.imageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "图片精选状态已更新。" });
}
