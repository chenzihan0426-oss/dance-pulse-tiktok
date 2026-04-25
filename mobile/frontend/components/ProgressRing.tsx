import React from "react";

export function ProgressRing({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const normalized = Math.max(0, Math.min(100, percent));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - normalized / 100);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="#A855F7"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[28px] font-semibold tracking-tight text-white">
            {normalized}%
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/40">
            完成度
          </div>
        </div>
      </div>

      <div>
        <div className="text-[13px] text-white/40">当前进度</div>
        <div className="mt-2 text-[18px] font-medium text-white">{label}</div>
      </div>
    </div>
  );
}
