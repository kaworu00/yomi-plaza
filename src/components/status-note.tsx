import { cn } from "@/lib/utils";

type StatusNoteProps = {
  title: string;
  body: string;
  tone?: "neutral" | "warning" | "success";
};

export function StatusNote({ title, body, tone = "neutral" }: StatusNoteProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-4 text-sm shadow-diffusion",
        tone === "neutral" && "border-ink-950/10 bg-white/70 text-ink-700",
        tone === "warning" && "border-amber-900/15 bg-amber-50 text-amber-950",
        tone === "success" && "border-moss-700/20 bg-moss-500/10 text-moss-700"
      )}
    >
      <p className="font-semibold text-ink-950">{title}</p>
      <p className="mt-1 leading-6">{body}</p>
    </div>
  );
}
