"use client";

import Image from "next/image";
import type { GalleryImage, GenerationTask, Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { StatusNote } from "@/components/status-note";
import Link from "next/link";
import { useState } from "react";
import { Copy } from "@phosphor-icons/react";

type DashboardViewProps = {
  profile: Profile | null;
  tasks: GenerationTask[];
  images: GalleryImage[];
};

export function DashboardView({ profile, tasks, images }: DashboardViewProps) {
  const [copyState, setCopyState] = useState<{ taskId: string; status: "copied" | "failed" } | null>(null);

  async function copyPrompt(task: GenerationTask) {
    const copied = await writeClipboard(task.prompt);
    setCopyState({ taskId: task.id, status: copied ? "copied" : "failed" });
    window.setTimeout(() => setCopyState((current) => (current?.taskId === task.id ? null : current)), 1800);
  }

  if (!profile) {
    return (
      <section className="mx-auto max-w-[900px] px-4 py-16 md:px-8">
        <StatusNote title="需要登录" body="登录后可以查看自己的积分、生成历史和图片资产。" tone="warning" />
        <Link className="mt-6 inline-flex rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper" href="/auth">
          登录或注册
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <div className="grid gap-6 md:grid-cols-[0.7fr_1.3fr]">
        <aside className="rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-moss-700">Account Ledger</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tighter text-ink-950">你的工作台历史</h1>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-paper p-4">
              <p className="font-mono text-3xl text-ink-950">{profile.credits}</p>
              <p className="mt-1 text-sm text-ink-700">可用积分</p>
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <p className="font-mono text-3xl text-ink-950">{images.length}</p>
              <p className="mt-1 text-sm text-ink-700">图片资产</p>
            </div>
          </div>
          <Link
            href="/workspace"
            className="mt-6 inline-flex rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition active:translate-y-px"
          >
            去制作新图
          </Link>
        </aside>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink-950">生成任务</h2>
            <div className="mt-4 divide-y divide-ink-950/10">
              {tasks.length === 0 ? (
                <p className="py-10 text-sm text-ink-700">还没有生成任务。</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="grid gap-3 py-5 md:grid-cols-[120px_1fr_150px]">
                    <p className="font-mono text-xs text-ink-700">{formatDate(task.created_at)}</p>
                    <div>
                      <p className="line-clamp-2 text-sm leading-6 text-ink-950">{task.prompt}</p>
                      {task.error_message && <p className="mt-2 text-xs text-amber-900">{task.error_message}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <span className="rounded-full bg-ink-950/5 px-3 py-1 text-xs text-ink-700">{task.status}</span>
                      <span className="font-mono text-xs text-ink-700">{task.credits_charged} credits</span>
                      <button
                        type="button"
                        onMouseDown={() => void copyPrompt(task)}
                        className="inline-flex items-center gap-1 rounded-full border border-ink-950/10 px-3 py-1 text-xs font-medium text-ink-800 transition hover:bg-paper active:translate-y-px"
                        aria-label="复制任务提示词"
                      >
                        <Copy size={14} />
                        {copyState?.taskId === task.id && copyState.status === "copied" && "已复制"}
                        {copyState?.taskId === task.id && copyState.status === "failed" && "复制失败"}
                        {copyState?.taskId !== task.id && "复制"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink-950">图片资产</h2>
            {images.length === 0 ? (
              <p className="mt-4 py-10 text-sm text-ink-700">生成成功的图片会保存在这里。</p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {images.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-3xl border border-ink-950/10 bg-paper">
                    <Image
                      src={image.image_url}
                      alt={image.title}
                      width={image.width}
                      height={image.height}
                      unoptimized
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="p-4">
                      <p className="font-semibold text-ink-950">{image.title}</p>
                      <p className="mt-1 text-xs text-ink-700">
                        {image.is_featured ? "已精选公开" : "私有，等待管理员精选"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("Clipboard timeout")), 800))
      ]);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
