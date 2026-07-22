import Link from "next/link";
import { CalendarCheck, Flame, Sparkles, Target } from "lucide-react";
import { ACTIVITY_PULSE, WEEKLY_GOAL } from "@/lib/communityShowcase";

function kindIcon(kind: string) {
  if (kind === "streak") return <Flame className="h-4 w-4 text-[#ff0055]" />;
  if (kind === "camp") return <Target className="h-4 w-4 text-[#00f3ff]" />;
  if (kind === "highlight") return <Sparkles className="h-4 w-4 text-[#ccff00]" />;
  return <CalendarCheck className="h-4 w-4 text-white/70" />;
}

export function ActivityPulseFeed() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
      <section className="space-y-3">
        <div className="mb-2 flex items-center gap-2">
          <h3
            className="text-[22px] font-black text-white"
            style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
          >
            打卡动态
          </h3>
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/35">Pulse</span>
        </div>
        {ACTIVITY_PULSE.map((item) => {
          const body = (
            <div className="border border-white/8 bg-black/35 px-5 py-4 transition hover:border-white/16 hover:bg-black/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center border border-white/10 bg-white/5">
                  {kindIcon(item.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-white">{item.displayName}</span>
                    <span className="text-[11px] text-white/35">@{item.username}</span>
                    <span className="font-mono text-[11px] text-white/30">{item.timeLabel}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-6 text-white/70">{item.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.streakDays ? (
                      <span className="bg-[#ff0055]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ff0055]">
                        连续 {item.streakDays} 天
                      </span>
                    ) : null}
                    {item.campDone != null && item.campTotal != null ? (
                      <span className="bg-[#00f3ff]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00f3ff]">
                        训练营 {item.campDone}/{item.campTotal}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );

          if (item.resultId) {
            return (
              <Link key={item.id} href={`/community/result/${item.resultId}`}>
                {body}
              </Link>
            );
          }
          return (
            <Link key={item.id} href={`/u/${item.username}`}>
              {body}
            </Link>
          );
        })}
      </section>

      <aside className="space-y-4">
        <div className="border border-[#ccff00]/25 bg-black/45 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ccff00]/85">
            {WEEKLY_GOAL.title}
          </div>
          <div className="mt-4 space-y-4">
            {WEEKLY_GOAL.items.map((goal) => {
              const pct = Math.round((goal.done / goal.total) * 100);
              return (
                <div key={goal.label}>
                  <div className="flex items-center justify-between text-[13px] text-white/75">
                    <span>{goal.label}</span>
                    <span className="font-mono text-white/45">
                      {goal.done}/{goal.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-white/10">
                    <div className="h-full bg-[#ccff00]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            href="/learn"
            className="mt-5 inline-flex bg-[#ccff00] px-4 py-2 text-[12px] font-bold text-black transition hover:bg-white"
            style={{ transform: "skewX(-6deg)" }}
          >
            <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>去练一支补进度</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}
