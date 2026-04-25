"use client";

interface ProgressFooterProps {
  learnedCount: number;
  totalCount: number;
  percent: number;
  currentStreak: number;
}

export function ProgressFooter({
  learnedCount,
  totalCount,
  percent,
  currentStreak,
}: ProgressFooterProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-30 mt-8 w-[min(calc(100%-2rem),72rem)] -translate-x-1/2 rounded-[24px] border border-white/10 bg-[rgba(18,17,31,0.92)] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white">已学会 {learnedCount} / {totalCount}</span>
            <span className="font-mono text-brand-light">
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-300 via-brand-500 to-pink-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
          连续学习 {currentStreak} 天
        </div>
      </div>
    </div>
  );
}
