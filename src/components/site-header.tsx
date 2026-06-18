"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Aperture, Coins, ImageSquare, SignIn, SignOut, SlidersHorizontal } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

type SiteHeaderProps = {
  profile: Profile | null;
};

const navItems = [
  { href: "/gallery", label: "广场", icon: ImageSquare },
  { href: "/workspace", label: "工作台", icon: Aperture },
  { href: "/admin", label: "后台", icon: SlidersHorizontal }
];

export function SiteHeader({ profile }: SiteHeaderProps) {
  const pathname = usePathname();
  const [currentProfile, setCurrentProfile] = useState(profile);

  useEffect(() => {
    let alive = true;

    async function syncProfile() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { profile: Profile | null };
        if (alive) {
          setCurrentProfile(payload.profile);
        }
      } catch {
        // Keep the server-rendered state if the session check fails.
      }
    }

    void syncProfile();
    window.addEventListener("focus", syncProfile);
    return () => {
      alive = false;
      window.removeEventListener("focus", syncProfile);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-ink-950/10 bg-paper/85 backdrop-blur-xl shadow-[inset_0_-1px_0_rgba(255,255,255,0.6)]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/gallery" className="group flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-950 text-paper transition-transform duration-300 group-hover:-rotate-6">
            <Aperture size={20} weight="bold" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight text-ink-950">黄泉广场</span>
            <span className="hidden text-xs text-ink-700 md:block">图片精选与生图工作台</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-ink-950/10 bg-white/60 p-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            if (item.href === "/admin" && currentProfile?.role !== "admin") {
              return null;
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm text-ink-700 transition duration-300 active:translate-y-px",
                  active && "bg-ink-950 text-paper shadow-diffusion"
                )}
              >
                <Icon size={17} weight={active ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {currentProfile ? (
            <>
              <Link
                href="/workspace"
                className="flex items-center gap-2 rounded-full border border-moss-700/20 bg-moss-500/10 px-3 py-2 text-sm text-moss-700 transition duration-300 hover:bg-moss-500/15 active:translate-y-px"
                title="积分余额"
              >
                <Coins size={17} weight="fill" />
                <span className="hidden text-xs text-ink-700 md:inline">积分余额</span>
                <span className="font-mono text-xs font-semibold text-ink-950">{currentProfile.credits}</span>
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setCurrentProfile(null);
                  await fetch("/api/sign-out", { method: "POST" });
                  window.location.href = "/gallery";
                }}
                className="flex items-center gap-2 rounded-full border border-ink-950/10 bg-white/70 px-3 py-2 text-sm text-ink-900 transition duration-300 hover:bg-white active:translate-y-px"
              >
                <SignOut size={17} />
                <span className="hidden md:inline">退出</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="flex items-center gap-2 rounded-full border border-ink-950/10 bg-white/70 px-3 py-2 text-sm text-ink-900 transition duration-300 hover:bg-white active:translate-y-px"
            >
              <SignIn size={17} />
              <span className="hidden md:inline">登录</span>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
