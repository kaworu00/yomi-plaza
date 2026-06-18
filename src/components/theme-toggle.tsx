"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function readTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const currentTheme = readTheme();
    setTheme(currentTheme);
    document.documentElement.dataset.theme = currentTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("yomi-theme", nextTheme);
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-full border border-ink-950/10 bg-white/70 px-3 py-2 text-sm text-ink-900 transition duration-300 hover:bg-white active:translate-y-px"
      aria-label={theme === "dark" ? "切换到亮调" : "切换到暗调"}
      title={theme === "dark" ? "切换到亮调" : "切换到暗调"}
    >
      <Icon size={17} weight="bold" />
      <span className="hidden md:inline">{theme === "dark" ? "亮调" : "暗调"}</span>
    </button>
  );
}
