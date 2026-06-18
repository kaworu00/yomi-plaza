import Link from "next/link";
import { GalleryGrid } from "@/components/gallery-grid";
import { StatusNote } from "@/components/status-note";
import { getCurrentProfile, getFeaturedImages } from "@/lib/queries";
import { hasSupabaseEnv } from "@/lib/env";

type GalleryPageProps = {
  searchParams?: {
    q?: string;
  };
};

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const [images, profile] = await Promise.all([getFeaturedImages(), getCurrentProfile()]);
  const keyword = searchParams?.q?.trim() ?? "";
  const filteredImages = keyword
    ? images.filter((image) => {
        const haystack = `${image.title} ${image.prompt} ${image.owner_name}`.toLowerCase();
        return haystack.includes(keyword.toLowerCase());
      })
    : images;

  return (
    <section className="w-full max-w-none px-4 py-6 md:px-6 2xl:px-8">
      <div className="relative grid overflow-hidden rounded-[2rem] border border-ink-950/10 bg-white/40 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] md:grid-cols-[1fr_0.9fr] md:items-end md:gap-10 md:px-9 md:py-8">
        <div className="relative text-left md:pointer-events-none md:absolute md:right-9 md:top-8 md:text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-ink-700/70 md:text-[11px] md:tracking-[0.42em]">
            Yomi Plaza
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none tracking-tighter text-ink-950 md:mt-2 md:text-6xl md:text-ink-950/90">
            黄泉广场
          </p>
        </div>

        <div className="relative mt-20 md:mt-28">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-moss-700">Curated Image Plaza</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tighter text-ink-950 md:text-6xl">
            一个只展示精选结果的图片广场。
          </h1>
        </div>
        <div className="relative mt-6 md:mt-28">
          <p className="max-w-xl text-base leading-8 text-ink-700">
            访客在这里浏览公开图片；注册用户进入工作台生成图片；管理员从用户作品中挑选内容进入广场。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/workspace"
              className="rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition duration-300 active:translate-y-px"
            >
              进入工作台
            </Link>
            {!profile && (
              <Link
                href="/auth"
                className="rounded-full border border-ink-950/10 bg-white/70 px-5 py-3 text-sm font-semibold text-ink-900 transition duration-300 active:translate-y-px"
              >
                登录或注册
              </Link>
            )}
          </div>
          <form action="/gallery" className="mt-5 flex max-w-xl gap-2">
            <input
              name="q"
              defaultValue={keyword}
              className="min-w-0 flex-1 rounded-full border border-ink-950/10 bg-white/75 px-5 py-3 text-sm text-ink-950 outline-none transition placeholder:text-ink-700/45 focus:border-ink-950/25"
              placeholder="按作品名称、提示词或作者搜索"
            />
            <button
              type="submit"
              className="rounded-full border border-ink-950/10 bg-white px-5 py-3 text-sm font-semibold text-ink-950 transition active:translate-y-px"
            >
              搜索
            </button>
          </form>
        </div>
      </div>

      {!hasSupabaseEnv() && (
        <div className="mb-8 mt-3">
          <StatusNote
            title="当前使用本地数据库"
            body="未配置 Supabase 时，图片、用户和积分会保存到本机 data/local-db.json；配置 Supabase 后会读取线上真实数据。"
          />
        </div>
      )}

      {keyword && (
        <p className="mb-4 mt-2 text-sm text-ink-700">
          搜索「{keyword}」：找到 {filteredImages.length} 张精选图片。
        </p>
      )}

      <GalleryGrid images={filteredImages} />
    </section>
  );
}
