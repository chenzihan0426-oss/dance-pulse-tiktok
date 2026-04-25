import React from "react";
import { Flame } from "lucide-react";

export function GreetingHeader({
  nickname,
  subtitle,
  streakDays,
}: {
  nickname: string;
  subtitle: string;
  streakDays: number;
}) {
  return (
    <section className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-white">
          嗨, {nickname}
        </h1>
        <p className="mt-3 text-[14px] text-white/45">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-[#411B2B] px-5 py-3 text-[#FF8B8B]">
        <Flame className="h-4 w-4 fill-current" />
        <span className="text-[14px] font-semibold">{streakDays} 天</span>
      </div>
    </section>
  );
}
