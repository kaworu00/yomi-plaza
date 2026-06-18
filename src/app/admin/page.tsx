import { AdminPanel } from "@/components/admin-panel";
import { StatusNote } from "@/components/status-note";
import { getAdminSnapshot, getCurrentProfile } from "@/lib/queries";
import { hasSupabaseEnv } from "@/lib/env";
import Link from "next/link";

export default async function AdminPage() {
  const [profile, snapshot] = await Promise.all([getCurrentProfile(), getAdminSnapshot()]);

  if (!profile) {
    return (
      <section className="mx-auto max-w-[900px] px-4 py-16 md:px-8">
        <StatusNote title="需要登录" body="后台只对管理员开放。" tone="warning" />
        <Link href="/auth" className="mt-6 inline-flex rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper">
          登录
        </Link>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="mx-auto max-w-[900px] px-4 py-16 md:px-8">
        <StatusNote title="没有后台权限" body="请让数据库管理员把你的 profiles.role 设置为 admin。" tone="warning" />
      </section>
    );
  }

  return (
    <AdminPanel
      users={snapshot.users}
      providers={snapshot.providers}
      models={snapshot.models}
      images={snapshot.images}
      isConfigured={hasSupabaseEnv()}
    />
  );
}
