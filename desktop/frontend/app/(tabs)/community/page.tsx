"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ArenaHero } from "@/components/community/ArenaHero";
import { CommunityFeedGrid } from "@/components/community/CommunityFeedGrid";
import { CommunityHubTabs } from "@/components/community/CommunityHubTabs";
import { FollowingFeed } from "@/components/community/FollowingFeed";
import { LeaderboardPanel } from "@/components/community/LeaderboardPanel";
import { ScoreDuel } from "@/components/community/ScoreDuel";
import {
  WEEKLY_CHALLENGE,
  WEEKLY_SCORE_DUEL,
  type CommunityHubTab,
} from "@/lib/communityShowcase";
import { useDemoCoverPool } from "@/lib/demoMedia";
import { useCommunityFeed } from "@/lib/useCommunityFeed";

function parseTab(raw: string | null): CommunityHubTab {
  if (raw === "hot" || raw === "recommend" || raw === "following" || raw === "arena") return raw;
  // 兼容旧链接
  if (raw === "plaza" || raw === "board") return raw === "board" ? "arena" : "hot";
  if (raw === "pulse") return "following";
  return "hot";
}

export default function CommunityPageDesktop() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen items-center justify-center text-white/45">
          <Loader2 className="h-5 w-5 animate-spin" />
        </main>
      }
    >
      <CommunityPageInner />
    </Suspense>
  );
}

function CommunityPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams?.get("tab") ?? null;
  const [tab, setTab] = React.useState<CommunityHubTab>(() => parseTab(tabParam));
  const feedFilter = tab === "recommend" ? "recommend" : tab === "following" ? "following" : "hot";
  const { items, loading } = useCommunityFeed(tab === "arena" ? "hot" : feedFilter);
  const { coverFor } = useDemoCoverPool();

  const arenaChallenge = React.useMemo(
    () => ({
      ...WEEKLY_CHALLENGE,
      thumb: coverFor("arena-hero", WEEKLY_CHALLENGE.thumb) ?? WEEKLY_CHALLENGE.thumb,
    }),
    [coverFor]
  );

  const arenaDuel = React.useMemo(
    () => ({
      ...WEEKLY_SCORE_DUEL,
      champion: {
        ...WEEKLY_SCORE_DUEL.champion,
        thumb:
          coverFor(`duel-${WEEKLY_SCORE_DUEL.champion.resultId}`, WEEKLY_SCORE_DUEL.champion.thumb) ??
          WEEKLY_SCORE_DUEL.champion.thumb,
      },
      challenger: {
        ...WEEKLY_SCORE_DUEL.challenger,
        thumb:
          coverFor(
            `duel-${WEEKLY_SCORE_DUEL.challenger.resultId}`,
            WEEKLY_SCORE_DUEL.challenger.thumb
          ) ?? WEEKLY_SCORE_DUEL.challenger.thumb,
      },
    }),
    [coverFor]
  );

  React.useEffect(() => {
    setTab(parseTab(tabParam));
  }, [tabParam]);

  function changeTab(next: CommunityHubTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    router.replace(`/community?${params.toString()}`, { scroll: false });
  }

  const subtitle =
    tab === "hot"
      ? "全站飙升同舞 · 刷到就是缘分"
      : tab === "recommend"
        ? "按你的练习口味猜你想跟"
        : tab === "following"
          ? "朋友刚练完、刚打卡、刚上分"
          : "同舞挑战 · 榜单对决 · 跟跳上榜";

  return (
    <main className="relative mx-auto min-h-screen max-w-[1560px] px-5 pb-20 pt-8 md:px-10 md:pt-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(255,0,85,0.12),transparent_60%)]" />

      <div className="relative mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ccff00]/80">
            DancePulse Community
          </div>
          <h1
            className="mt-2 text-[36px] font-black tracking-tight text-white md:text-[48px]"
            style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
          >
            社区
          </h1>
          <p className="mt-2 max-w-xl text-[14px] text-white/50">{subtitle}</p>
        </div>
        <CommunityHubTabs value={tab} onChange={changeTab} />
      </div>

      {tab === "hot" || tab === "recommend" ? (
        <div className="relative space-y-6">
          {tab === "hot" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/35 px-4 py-3">
              <div className="text-[13px] text-white/70">
                <span className="font-bold text-[#ff0055]">热门飙升</span>
                <span className="mx-2 text-white/25">·</span>
                今天已有 {WEEKLY_CHALLENGE.participants.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 人参与同舞
              </div>
              <button
                type="button"
                onClick={() => changeTab("arena")}
                className="text-[12px] font-semibold text-[#ccff00] hover:underline"
              >
                去竞技场 →
              </button>
            </div>
          ) : (
            <div className="border border-white/10 bg-black/35 px-4 py-3 text-[13px] text-white/60">
              <span className="font-bold text-[#00f3ff]">为你推荐</span>
              <span className="mx-2 text-white/25">·</span>
              根据你的练习挑了一些作品
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-white/45">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : (
            <CommunityFeedGrid items={items} />
          )}
        </div>
      ) : null}

      {tab === "following" ? <FollowingFeed /> : null}

      {tab === "arena" ? (
        <div className="relative space-y-6">
          <ArenaHero challenge={arenaChallenge} />
          <ScoreDuel duel={arenaDuel} />
          <LeaderboardPanel />
        </div>
      ) : null}
    </main>
  );
}
