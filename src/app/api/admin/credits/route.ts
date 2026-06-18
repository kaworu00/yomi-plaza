import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { grantLocalCredits } from "@/lib/local-db";

type CreditBody = {
  userId?: string;
  delta?: string | number;
  reason?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreditBody;
  const delta = Number(body.delta);
  const reason = body.reason?.trim() || "Admin credit adjustment";

  if (!body.userId || !Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: "Valid userId and non-zero delta are required." }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    const adminProfile = getDemoProfileFromCookie();
    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ error: "需要管理员权限。" }, { status: 403 });
    }

    try {
      const profile = grantLocalCredits(body.userId, delta, reason, adminProfile.id);
      return NextResponse.json({ message: `积分已更新，${profile.display_name ?? profile.email} 当前 ${profile.credits} 积分。` });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "积分更新失败。" }, { status: 400 });
    }
  }

  const admin = await requireAdmin();
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { error } = await admin.service.rpc("grant_credits", {
    target_user: body.userId,
    credit_delta: delta,
    ledger_reason: reason,
    actor: admin.user.id
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "积分已更新。" });
}
