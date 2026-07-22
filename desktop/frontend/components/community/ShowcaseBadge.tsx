import type { ReactNode } from "react";

export function ShowcaseBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "gold" | "live" | "soft";
}) {
  const toneClass =
    tone === "gold"
      ? "bg-amber-400/15 text-amber-200 ring-amber-300/30"
      : tone === "live"
        ? "bg-rose-500/20 text-rose-100 ring-rose-400/40"
        : tone === "soft"
          ? "bg-white/8 text-white/65 ring-white/10"
          : "bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/25";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${toneClass}`}
    >
      {children}
    </span>
  );
}
