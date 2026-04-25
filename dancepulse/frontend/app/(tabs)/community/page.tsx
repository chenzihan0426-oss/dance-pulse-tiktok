"use client";

import * as React from "react";
import { Flame, Loader2, Sparkles } from "lucide-react";
import { CommunityResultCard } from "@/components/community/CommunityResultCard";
import { getCommunityFeed } from "@/lib/api";
import type { CommunityFeedItem } from "@/lib/types";

export default function CommunityPage() {
  const [items, setItems] = React.useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void getCommunityFeed()
      .then((feed) => {
        if (!cancelled) {
          setItems(feed);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/12 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-brand-light">
            <Sparkles className="h-3.5 w-3.5" />
            Community
          </div>
          <h1 className="mt-4 text-[30px] font-semibold tracking-tight text-white">作品社区</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/45">
            看别人怎么跳、怎么拿分，也能顺手点进主页继续挖同风格作品。
          </p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#421B2B] text-[#FF7C9D]">
          <Flame className="h-5 w-5" />
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex h-48 items-center justify-center rounded-[28px] bg-bg-surface text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="mt-10 rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/8 bg-bg-surface px-5 py-6 text-sm text-white/45">
          还没有公开作品。先去课程里完成一次跟拍挑战，发布后这里就会出现第一批作品。
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {items.map((item) => (
            <CommunityResultCard
              key={item.result.id}
              item={item}
              href={`/community/result/${item.result.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
