import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { deleteLocalModel, updateLocalProviderAndModel } from "@/lib/local-db";

type ModelRouteProps = {
  params: {
    id: string;
  };
};

type ModelBody = {
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  displayName?: string;
  creditCost?: string | number;
};

export async function PUT(request: NextRequest, { params }: ModelRouteProps) {
  const body = (await request.json()) as ModelBody;
  const creditCost = Number(body.creditCost);

  if (!body.label || !body.baseUrl || !body.modelName || !body.displayName || !Number.isFinite(creditCost)) {
    return NextResponse.json({ error: "模型配置字段不完整。" }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      const { model } = updateLocalProviderAndModel(params.id, {
        label: body.label.trim(),
        baseUrl: body.baseUrl.trim(),
        apiKey: body.apiKey?.trim(),
        modelName: body.modelName.trim(),
        displayName: body.displayName.trim(),
        creditCost: Math.max(1, Math.round(creditCost))
      });
      return NextResponse.json({ message: `模型「${model.display_name}」已更新。` });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型更新失败。" }, { status: 400 });
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

  const { data: duplicateModels, error: duplicateModelsError } = await admin.service
    .from("image_models")
    .select("id,display_name")
    .ilike("display_name", body.displayName.trim())
    .neq("id", params.id)
    .limit(1);

  if (duplicateModelsError) {
    return NextResponse.json({ error: duplicateModelsError.message }, { status: 500 });
  }

  if (duplicateModels?.[0]) {
    return NextResponse.json({ error: `模型「${duplicateModels[0].display_name}」已经存在。` }, { status: 409 });
  }

  const providerUpdate: { label: string; base_url: string; api_key?: string } = {
    label: body.label.trim(),
    base_url: body.baseUrl.trim()
  };

  if (body.apiKey?.trim()) {
    providerUpdate.api_key = body.apiKey.trim();
  }

  const { error: providerError } = await admin.service
    .from("image_providers")
    .update(providerUpdate)
    .eq("id", model.provider_id);

  if (providerError) {
    return NextResponse.json({ error: providerError.message }, { status: 500 });
  }

  const { error: modelError } = await admin.service
    .from("image_models")
    .update({
      name: body.modelName.trim(),
      display_name: body.displayName.trim(),
      credit_cost: Math.max(1, Math.round(creditCost))
    })
    .eq("id", params.id);

  if (modelError) {
    return NextResponse.json({ error: modelError.message }, { status: 500 });
  }

  return NextResponse.json({ message: `模型「${body.displayName.trim()}」已更新。` });
}

export async function DELETE(_request: NextRequest, { params }: ModelRouteProps) {
  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      const model = deleteLocalModel(params.id);
      return NextResponse.json({ message: `模型「${model.display_name}」已删除。` });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型删除失败。" }, { status: 400 });
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

  const { error } = await admin.service.from("image_models").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `模型「${model.display_name}」已删除。` });
}
