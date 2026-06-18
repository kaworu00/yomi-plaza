import Image from "next/image";
import Link from "next/link";
import type { GalleryImage } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type GalleryGridProps = {
  images: GalleryImage[];
};

export function GalleryGrid({ images }: GalleryGridProps) {
  if (images.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-ink-950/20 bg-white/50 px-8 py-16 text-center">
        <p className="text-lg font-semibold text-ink-950">还没有公开精选图片</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-700">
          管理员在后台把生成图片设为精选后，它们会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="gap-4 [column-width:clamp(160px,16vw,240px)] sm:gap-5">
      {images.map((image, index) => (
        <Link
          key={image.id}
          href={`/gallery/${image.id}`}
          className="group mb-4 block w-full break-inside-avoid animate-reveal sm:mb-5"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="overflow-hidden rounded-[1.15rem] border border-ink-950/10 bg-white shadow-diffusion">
            <Image
              src={image.image_url}
              alt={image.title}
              width={image.width}
              height={image.height}
              unoptimized
              className="h-auto w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              sizes="(min-width: 1600px) 16vw, (min-width: 1280px) 18vw, (min-width: 900px) 24vw, (min-width: 560px) 34vw, 50vw"
            />
          </div>
          <div className="px-0.5 pt-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight text-ink-950">{image.title}</h2>
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wide text-ink-700/60">
                {formatDate(image.created_at)}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-700">{image.prompt}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
