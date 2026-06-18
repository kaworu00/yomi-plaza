import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function deriveTitle(prompt: string) {
  return prompt
    .split(/[,.，。]/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "Untitled Render";
}
