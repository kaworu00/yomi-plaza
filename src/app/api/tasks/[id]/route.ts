import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

type TaskRouteProps = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, { params }: TaskRouteProps) {
  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  if (!supabase || !service) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 501 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: profile } = await service.from("profiles").select("*").eq("id", user.id).single();
  const query = service.from("generation_tasks").select("*").eq("id", params.id);
  const { data: task } = profile?.role === "admin" ? await query.single() : await query.eq("user_id", user.id).single();

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({ task });
}
