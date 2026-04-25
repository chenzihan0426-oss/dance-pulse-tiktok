import React from "react";
import { Star } from "lucide-react";

export function BadgeUnlockCard({
  title,
}: {
  title: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.12)] px-4 py-2 text-[12px] font-medium text-[#fcd34d]">
      <Star className="h-3.5 w-3.5 fill-current" />
      新徽章 · {title}
    </div>
  );
}
