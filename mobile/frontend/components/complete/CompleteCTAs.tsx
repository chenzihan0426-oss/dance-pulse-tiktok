import Link from "next/link";
import { Film } from "lucide-react";

export function CompleteCTAs({
  fullPlayHref,
  trackingHref,
  restartHref,
  lessonHref,
}: {
  fullPlayHref: string;
  trackingHref: string;
  restartHref: string;
  lessonHref: string;
}) {
  return (
    <div className="space-y-3">
      <Link href={fullPlayHref} className="block">
        <div className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-white transition hover:bg-brand/90">
          <Film className="h-5 w-5" />
          整首跟一遍
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href={trackingHref} className="block">
          <div className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[14px] font-medium text-white/90 transition hover:bg-white/10">
            去跟拍挑战
          </div>
        </Link>
        <Link href={restartHref} className="block">
          <div className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[14px] font-medium text-white/90 transition hover:bg-white/10">
            从头复习
          </div>
        </Link>
      </div>

      <div className="pt-2 text-center">
        <Link href={lessonHref} className="text-sm text-white/50 transition hover:text-white/70">
          返回课程页
        </Link>
      </div>
    </div>
  );
}
