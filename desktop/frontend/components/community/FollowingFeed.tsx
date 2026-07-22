"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, MessageCircle, Users } from "lucide-react";
import {
  FOLLOWING_USERNAMES,
  SHOWCASE_WORK_META,
  ACTIVITY_PULSE,
  getShowcaseFeedSorted,
} from "@/lib/communityShowcase";
import { resolveMediaUrl } from "@/lib/api";
import { rotateFeedThumbs, useDemoCoverPool } from "@/lib/demoMedia";

export function FollowingFeed() {
  const { thumbs } = useDemoCoverPool();
  const friendWorks = React.useMemo(
    () => rotateFeedThumbs(getShowcaseFeedSorted("following").slice(0, 8), thumbs),
    [thumbs]
  );
  const friendPulse = ACTIVITY_PULSE.filter((item) =>
    (FOLLOWING_USERNAMES as readonly string[]).includes(item.username)
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <section>
        <div className="mb-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/45">
          <Users className="h-3.5 w-3.5 text-[#00f3ff]" />
          好友动态
        </div>
        <div className="divide-y divide-white/8 border border-white/10 bg-black/35">
          {friendPulse.map((item) => (
            <Link
              key={item.id}
              href={item.resultId ? `/community/result/${item.resultId}` : `/u/${item.username}`}
              className="block px-4 py-4 transition hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center bg-white/10 text-[12px] font-bold">
                  {item.displayName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">
                    {item.displayName}
                    <span className="ml-2 font-normal text-white/35">@{item.username}</span>
                  </div>
                  <div className="text-[11px] text-white/35">{item.timeLabel}</div>
                </div>
              </div>
              <p className="mt-2 text-[14px] leading-6 text-white/75">{item.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/45">
          关注的人刚发
        </div>
        <div className="space-y-3">
          {friendWorks.map((item) => {
            const meta = SHOWCASE_WORK_META[item.result.id];
            const thumb = item.previewThumbnail ? resolveMediaUrl(item.previewThumbnail) : null;
            return (
              <Link
                key={item.result.id}
                href={`/community/result/${item.result.id}`}
                className="flex gap-3 border border-white/10 bg-black/40 p-2 transition hover:border-white/20"
              >
                <div
                  className="h-24 w-16 shrink-0 bg-cover bg-center"
                  style={
                    thumb
                      ? { backgroundImage: `url("${thumb}")` }
                      : { background: "linear-gradient(160deg,#1a1020,#050505)" }
                  }
                />
                <div className="min-w-0 flex-1 py-1">
                  <div className="text-[12px] text-white/45">@{item.user.displayName}</div>
                  <div className="mt-1 line-clamp-1 text-[14px] font-semibold text-white">{item.lessonTitle}</div>
                  {meta?.caption ? (
                    <div className="mt-1 line-clamp-2 text-[12px] text-white/50">{meta.caption}</div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-white/40">
                    <span className="font-mono text-[#ccff00]">{item.result.score} 分</span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {item.result.likeCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {item.result.commentCount}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
