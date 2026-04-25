"use client";

// PC /community: 社区 feed 瀑布流
//   - 大标题
//   - 多列卡片 (作品缩略图 + 作者 + 分数 + 点赞数)

import * as React from "react";
import Link from "next/link";
import { Flame, Loader2, Sparkles } from "lucide-react";
import { getCommunityFeed } from "@/lib/api";
import type { CommunityFeedItem } from "@/lib/types";

export default function CommunityPageDesktop() {
  const [items, setItems] = React.useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getCommunityFeed()
      .then((feed) => { if (!cancelled) setItems(feed); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-[1560px] px-16 pb-20 pt-10">
      <div className="mb-10">
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-white/45">
          <Flame className="h-3 w-3" />
          Community
        </div>
        <h1 className="mt-2 text-[44px] font-bold tracking-tight text-white">挑战作品</h1>
        <p className="mt-3 text-[14px] text-white/55">看看别人跳得怎么样。</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-white/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white/5 px-6 py-16 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-white/30" />
          <div className="mt-4 text-[15px] text-white/55">
            社区还很安静,等你挑战后发布第一支作品。
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.result.id}
              href={`/community/result/${item.result.id}`}
              className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition hover:bg-white/[0.08]"
            >
              <div
                className="aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.035]"
                style={item.previewThumbnail ? { backgroundImage: `url("${item.previewThumbnail}")` } : { background: "linear-gradient(135deg,#2a1454,#0a0414)" }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_35%,rgba(0,0,0,0.9)_100%)]" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/85 backdrop-blur">
                <Sparkles className="h-3 w-3 text-amber-300" />
                {item.result.score}
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="line-clamp-1 text-[15px] font-semibold text-white">{item.lessonTitle}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-white/55">
                  <span>@{item.user.displayName || item.user.username}</span>
                  <span>{item.likedByMe ? "♥" : "❤"} {item.result.likeCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
