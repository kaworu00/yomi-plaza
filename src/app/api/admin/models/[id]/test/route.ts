import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocalModelConnection } from "@/lib/local-db";
import { testOpenAICompatibleConnection } from "@/lib/openai-compatible";

type ModelTestRouteProps = {
  params: {
    id: string;
  };
};

type ModelTestBody = {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
};

export async function POST(request: NextRequest, { params }: ModelTestRouteProps) {
  const body = await readTestBody(request);

  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      const { model, provider } = getLocalModelConnection(params.id);
      const baseUrl = body.baseUrl?.trim() || provider.base_url;
      const apiKey = body.apiKey?.trim() || provider.api_key;
      const modelName = body.modelName?.trim() || model.name;

      if (baseUrl.startsWith("local://")) {
        return NextResponse.json({ message: "本地占位模型可用。" });
      }

      if (!apiKey) {
        return NextResponse.json({ error: "当前供应商还没有保存 API Key。" }, { status: 400 });
      }

      const result = await testOpenAICompatibleConnection({
        baseUrl,
        apiKey,
        model: modelName
      });

      return NextResponse.json({ message: result.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "连通测试失败。";
      return NextResponse.json({ error: `连通测试失败：${message}` }, { status: 502 });
    }
  }

  const admin = await requireAdmin();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { data: model } = await admin.service.from("image_models").select("*").eq("id", params.id).single();
  if (!model) {
    return NextResponse.json({ error: "模型不存在。" }, { status: 404 });
  }

  const { data: provider } = await admin.service.from("image_providers").select("*").eq("id", model.provider_id).single();
  if (!provider) {
    return NextResponse.json({ error: "供应商不存在。" }, { status: 404 });
  }

  const baseUrl = body.baseUrl?.trim() || provider.base_url;
  const apiKey = body.apiKey?.trim() || provider.api_key;
  const modelName = body.modelName?.trim() || model.name;

  if (!apiKey) {
    return NextResponse.json({ error: "当前供应商还没有保存 API Key。" }, { status: 400 });
  }

  try {
    const result = await testOpenAICompatibleConnection({
      baseUrl,
      apiKey,
      model: modelName
    });

    return NextResponse.json({ message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "连通测试失败。";
    return NextResponse.json({ error: `连通测试失败：${message}` }, { status: 502 });
  }
}

async function readTestBody(request: NextRequest) {
  try {
    return (await request.json()) as ModelTestBody;
  } catch {
    return {};
  }
}
