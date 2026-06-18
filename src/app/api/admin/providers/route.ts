import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { addLocalProviderAndModel } from "@/lib/local-db";

type ProviderBody = {
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  displayName?: string;
  creditCost?: string | number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProviderBody;
  const creditCost = Number(body.creditCost);

  if (!body.label || !body.baseUrl || !body.apiKey || !body.modelName || !body.displayName || !Number.isFinite(creditCost)) {
    return NextResponse.json({ error: "Provider and model fields are required." }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      addLocalProviderAndModel({
        label: body.label.trim(),
        baseUrl: body.baseUrl.trim(),
        apiKey: body.apiKey.trim(),
        modelName: body.modelName.trim(),
        displayName: body.displayName.trim(),
        creditCost: Math.max(1, Math.round(creditCost))
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "模型保存失败。" }, { status: 409 });
    }

    return NextResponse.json({ message: "供应商与模型已保存到本地数据库。" });
  }

  const admin = await requireAdmin();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { data: existingModels, error: existingModelsError } = await admin.service
    .from("image_models")
    .select("id,display_name")
    .ilike("display_name", body.displayName.trim())
    .limit(1);

  if (existingModelsError) {
    return NextResponse.json({ error: existingModelsError.message }, { status: 500 });
  }

  if (existingModels?.[0]) {
    return NextResponse.json({ error: `模型「${existingModels[0].display_name}」已经存在。` }, { status: 409 });
  }

  const { data: provider, error: providerError } = await admin.service
    .from("image_providers")
    .insert({
      label: body.label.trim(),
      base_url: body.baseUrl.trim(),
      api_key: body.apiKey.trim(),
      is_active: true
    })
    .select("*")
    .single();

  if (providerError || !provider) {
    return NextResponse.json({ error: providerError?.message ?? "Could not save provider." }, { status: 500 });
  }

  const { error: modelError } = await admin.service.from("image_models").insert({
    provider_id: provider.id,
    name: body.modelName.trim(),
    display_name: body.displayName.trim(),
    credit_cost: Math.max(1, Math.round(creditCost)),
    is_active: true
  });

  if (modelError) {
    return NextResponse.json({ error: modelError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "供应商与模型已保存。" });
}
