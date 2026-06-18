import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { demoSessionCookie } from "@/lib/demo-auth";

export async function POST() {
  const supabase = createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  const response = NextResponse.json({ message: "已退出登录。" });
  response.cookies.set(demoSessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
