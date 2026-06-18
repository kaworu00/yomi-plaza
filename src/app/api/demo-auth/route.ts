import { NextResponse, type NextRequest } from "next/server";
import { demoSessionCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { authenticateLocalUser, createLocalUser } from "@/lib/local-db";

type DemoAuthBody = {
  username?: string;
  password?: string;
  mode?: "sign-in" | "sign-up";
  displayName?: string;
};

export async function POST(request: NextRequest) {
  if (hasSupabaseEnv()) {
    return NextResponse.json({ error: "Demo login is disabled when Supabase is configured." }, { status: 404 });
  }

  const body = (await request.json()) as DemoAuthBody;
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (username.length < 2 || password.length < 6) {
    return NextResponse.json({ error: "账号至少 2 位，密码至少 6 位。" }, { status: 400 });
  }

  try {
    const profile =
      body.mode === "sign-up"
        ? createLocalUser(username, password, body.displayName?.trim())
        : authenticateLocalUser(username, password);

    if (!profile) {
      return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
    }

    const response = NextResponse.json({ message: profile.role === "admin" ? "管理员登录成功。" : "登录成功。" });
    response.cookies.set(demoSessionCookie, profile.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "账号操作失败。" }, { status: 400 });
  }
}
