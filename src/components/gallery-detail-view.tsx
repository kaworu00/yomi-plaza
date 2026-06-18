"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookmarkSimple,
  CalendarBlank,
  ChatCircle,
  Copy,
  DownloadSimple,
  Eye,
  Heart,
  ShareNetwork,
  Sparkle,
  UserPlus
} from "@phosphor-icons/react";
import type { GalleryImage, Profile } from "@/lib/types";
import type { GalleryComment } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type GalleryDetailViewProps = {
  image: GalleryImage;
  profile: Profile | null;
};

export function GalleryDetailView({ image, profile }: GalleryDetailViewProps) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [following, setFollowing] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [commentError, setCommentError] = useState("");

  const ownerInitial = useMemo(() => image.owner_name.trim().slice(0, 1).toUpperCase() || "创", [image.owner_name]);
  const description = image.description?.trim() || "作者还没有为这张作品添加说明。";
  const ownerBio = image.owner_bio?.trim() || "这个作者还没有填写个人说明。";
  const promptReferences = useMemo(() => {
    const referencedLabels = new Set(Array.from(image.prompt.matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]+)/g)).map((match) => match[1]));
    return (image.reference_images ?? []).filter((reference) => referencedLabels.has(reference.label));
  }, [image.prompt, image.reference_images]);
  const hasReferenceMentions = /@[\u4e00-\u9fa5A-Za-z0-9_-]+/.test(image.prompt);

  useEffect(() => {
    let alive = true;
    async function loadComments() {
      try {
        const response = await fetch(`/api/images/${image.id}/comments`, { cache: "no-store" });
        const payload = (await response.json()) as { comments?: GalleryComment[] };
        if (alive) {
          setComments(payload.comments ?? []);
        }
      } catch {
        if (alive) {
          setComments([]);
        }
      }
    }

    void loadComments();
    return () => {
      alive = false;
    };
  }, [image.id]);

  async function copyPrompt() {
    const ok = await writeText(image.prompt);
    setCopyState(ok ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 1600);
  }

  async function shareImage() {
    const url = window.location.href;
    if ("share" in navigator) {
      try {
        await navigator.share({ title: image.title, text: image.prompt, url });
        setShared(true);
        return;
      } catch {
        // Fall back to copying the link below.
      }
    }
    const ok = await writeText(url);
    setShared(ok);
  }

  async function addComment() {
    const body = commentText.trim();
    if (!body) {
      return;
    }
    setCommentError("");
    const response = await fetch(`/api/images/${image.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const payload = (await response.json()) as { comment?: GalleryComment; error?: string };
    if (!response.ok || !payload.comment) {
      setCommentError(payload.error ?? "评论发布失败。");
      return;
    }
    setComments((current) => [payload.comment as GalleryComment, ...current]);
    setCommentText("");
  }

  return (
    <section className="theme-aware-dark min-h-[calc(100dvh-73px)] bg-[#34302f] px-4 py-6 text-white md:px-8">
      <div className="mx-auto grid max-w-[1560px] gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.78fr)]">
        <div className="relative">
          <Link
            href="/gallery"
            className="absolute left-0 top-0 z-10 grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/5 text-white/80 backdrop-blur transition hover:bg-white/12 hover:text-white"
            aria-label="返回广场"
          >
            <ArrowLeft size={22} />
          </Link>

          <div className="mx-auto max-w-[760px] pt-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{image.title}</h1>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <CalendarBlank size={17} weight="fill" />
                {formatDate(image.created_at)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye size={17} weight="fill" />
                21 次浏览
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <div className="overflow-hidden bg-black/20 shadow-2xl shadow-black/30">
              <Image
                src={image.image_url}
                alt={image.title}
                width={image.width}
                height={image.height}
                unoptimized
                priority
                className="max-h-[72dvh] w-auto max-w-full object-contain"
                sizes="(min-width: 1024px) 56vw, 100vw"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-3">
            <ActionButton active={liked} onClick={() => setLiked((value) => !value)} label={liked ? "已点赞" : "点赞"}>
              <Heart size={22} weight={liked ? "fill" : "regular"} />
              {liked ? 1 : 0}
            </ActionButton>
            <ActionButton active={saved} onClick={() => setSaved((value) => !value)} label={saved ? "已收藏" : "收藏"}>
              <BookmarkSimple size={22} weight={saved ? "fill" : "regular"} />
              {saved ? 1 : 0}
            </ActionButton>
            <ActionButton active={shared} onClick={() => void shareImage()} label="转发">
              <ShareNetwork size={22} />
              {shared ? 1 : 0}
            </ActionButton>
            <a
              href={image.image_url}
              download={`${image.title}.png`}
              className="inline-flex min-w-16 items-center justify-center gap-2 rounded-full bg-black/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >
              <DownloadSimple size={22} />
              下载
            </a>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar imageUrl={image.owner_avatar_url} name={image.owner_name} fallback={ownerInitial} size="large" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{image.owner_name}</p>
                <p className="text-sm text-white/45">粉丝 5</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFollowing((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                following ? "bg-white text-[#181615]" : "bg-rose-500 text-white hover:bg-rose-400"
              }`}
            >
              <UserPlus size={18} weight="bold" />
              {following ? "已关注" : "关注"}
            </button>
          </div>

          <InfoPanel title="说明">
            <p className="text-sm leading-7 text-white/68">{description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white/80">#{image.model_name}</span>
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white/80">#{image.width}x{image.height}</span>
            </div>
          </InfoPanel>

          <InfoPanel
            title="提示词"
            action={
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#181615] transition hover:bg-white/90"
              >
                <Copy size={16} />
                {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
              </button>
            }
          >
            <p className="max-h-56 overflow-y-auto pr-2 text-sm leading-7 text-white/68">{image.prompt}</p>
            {(promptReferences.length > 0 || hasReferenceMentions) && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold text-white/45">提示词引用的参考图</p>
                {promptReferences.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {promptReferences.map((reference) => (
                      <figure key={`${reference.label}-${reference.image_url}`} className="w-20 overflow-hidden rounded-2xl bg-black/35">
                        <div className="relative aspect-square">
                          <Image
                            src={reference.image_url}
                            alt={`@${reference.label}`}
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="80px"
                          />
                        </div>
                        <figcaption className="truncate px-2 py-1.5 font-mono text-[11px] text-emerald-100">@{reference.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-white/38">这张旧作品的参考图缩略图没有被保存，重新生成后的作品会自动显示。</p>
                )}
              </div>
            )}
          </InfoPanel>

          <InfoPanel title="作者">
            <p className="text-sm leading-7 text-white/62">{ownerBio}</p>
          </InfoPanel>

          <section className="rounded-3xl bg-[#242120] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <ChatCircle size={23} />
                {comments.length} 条评论
              </h2>
              <div className="rounded-full bg-black/35 p-1 text-xs">
                <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-[#181615]">最新</span>
                <span className="px-3 py-1.5 text-white/45">热门</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Avatar imageUrl={profile?.avatar_url} name={profile?.display_name ?? "访客"} fallback="我" size="small" />
              <input
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void addComment();
                  }
                }}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/35 px-5 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
                placeholder={profile ? "写下你的评论..." : "登录后可评论，当前先保存到本页预览"}
              />
              <button type="button" onClick={() => void addComment()} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#181615]">
                发布
              </button>
            </div>
            {commentError && <p className="mt-3 text-sm text-amber-200">{commentError}</p>}

            <div className="mt-5 space-y-4">
              {comments.length === 0 ? (
                <p className="py-6 text-sm text-white/45">还没有公开评论。</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl bg-black/25 px-4 py-3">
                    <p className="text-sm font-semibold text-white">{comment.author_name}</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">{comment.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ActionButton({
  active,
  onClick,
  label,
  children
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-w-16 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-white text-[#181615]" : "bg-black/80 text-white hover:bg-black"
      }`}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function InfoPanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-[#242120] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold">
          <Sparkle size={19} weight="fill" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Avatar({
  imageUrl,
  name,
  fallback,
  size
}: {
  imageUrl?: string | null;
  name?: string | null;
  fallback: string;
  size: "large" | "small";
}) {
  const className = size === "large" ? "h-16 w-16" : "h-12 w-12";
  return (
    <span className={`relative grid ${className} shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-sm font-semibold text-white`}>
      {imageUrl ? (
        <Image src={imageUrl} alt={name ?? "头像"} fill unoptimized className="object-cover" sizes={size === "large" ? "64px" : "48px"} />
      ) : (
        fallback
      )}
    </span>
  );
}

async function writeText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}
