"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  tab: "all" | "unlearned";
  minDifficulty: number;
  visibleCount: number;
  totalCount: number;
  onTabChange: (tab: "all" | "unlearned") => void;
  onDifficultyChange: (value: number) => void;
}

export function FilterBar({
  tab,
  minDifficulty,
  visibleCount,
  totalCount,
  onTabChange,
  onDifficultyChange,
}: FilterBarProps) {
  return (
    <div className="sticky top-[72px] z-20">
      <div className="rounded-[24px] border border-white/10 bg-[rgba(18,17,31,0.84)] px-4 py-4 shadow-[0_16px_36px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-[14px] bg-white/5 p-1">
              {[
                { id: "all", label: "全部切片" },
                { id: "unlearned", label: "只看未学会" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id as "all" | "unlearned")}
                  className={cn(
                    "rounded-[12px] px-4 py-2 text-sm transition",
                    tab === item.id
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-[var(--muted)] hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--muted)]">
              {visibleCount}/{totalCount} 个切片
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:min-w-[320px] lg:max-w-[360px] lg:flex-1">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <SlidersHorizontal className="h-4 w-4" />
              难度筛选
            </label>
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>至少 {minDifficulty} 星</span>
              <span>向右拖动提高难度</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={minDifficulty}
              onChange={(event) => onDifficultyChange(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-brand"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
