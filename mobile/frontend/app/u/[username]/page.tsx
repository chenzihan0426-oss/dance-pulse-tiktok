"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { CommunityResultCard } from "@/components/community/CommunityResultCard";
import { Button } from "@/components/ui/button";
import { getCommunityUserProfile, toggleCommunityFollow } from "@/lib/api";
import type { CommunityUserProfileResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? "";
  const { user } = useAuth();
  const [data, setData] = React.useState<CommunityUserProfileResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void getCommunityUserProfile(username)
      .then((response) => {
        if (!cancelled) {
          setData(response);
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
  }, [username]);

  async function handleFollow() {
    if (!data) return;
    const next = await toggleCommunityFollow(data.user.username);
    setData((current) =>
      current
        ? {
            ...current,
            user: {
              ...current.user,
              isFollowing: next.following,
              stats: {
                ...current.user.stats,
                followerCount: next.followerCount,
              },
            },
          }
        : current
    );
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="flex h-48 items-center justify-center rounded-[28px] bg-bg-surface text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
          {error ?? "主页加载失败"}
        </div>
      </main>
    );
  }

  const isOwnProfile = user?.username === data.user.username;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8 text-white">
      <Link
        href="/community"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回社区
      </Link>

      <section className="mt-6 rounded-[30px] border border-white/8 bg-bg-raised px-5 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[28px] font-semibold text-white">
              {data.user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.user.avatar} alt={data.user.displayName} className="h-full w-full rounded-full object-cover" />
              ) : (
                data.user.displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-[24px] font-semibold tracking-tight text-white">
                  {data.user.displayName}
                </div>
                {data.user.isVerified ? <ShieldCheck className="h-4 w-4 text-brand-light" /> : null}
              </div>
              <div className="mt-1 text-[13px] text-white/45">@{data.user.username}</div>
            </div>
          </div>

          {!isOwnProfile ? (
            <Button variant={data.user.isFollowing ? "secondary" : "primary"} onClick={handleFollow} className="rounded-[16px]">
              {data.user.isFollowing ? "已关注" : "关注"}
            </Button>
          ) : null}
        </div>

        {data.user.bio ? <div className="mt-4 text-[14px] leading-6 text-white/55">{data.user.bio}</div> : null}

        <div className="mt-5 grid grid-cols-4 gap-3">
          <Stat label="粉丝" value={data.user.stats.followerCount} />
          <Stat label="关注" value={data.user.stats.followingCount} />
          <Stat label="作品" value={data.user.stats.publishedTrackingCount} />
          <Stat label="获赞" value={data.user.stats.totalLikesReceived} />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-5 text-[22px] font-semibold tracking-tight text-white">公开作品</div>
        {data.results.length === 0 ? (
          <div className="rounded-[24px] border border-white/8 bg-bg-surface px-5 py-5 text-sm text-white/45">
            还没有公开作品。
          </div>
        ) : (
          <div className="space-y-4">
            {data.results.map((item) => (
              <CommunityResultCard
                key={item.result.id}
                item={item}
                href={`/community/result/${item.result.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-white/[0.04] px-3 py-4 text-center">
      <div className="text-[24px] font-semibold leading-none text-white">{value}</div>
      <div className="mt-2 text-[12px] text-white/45">{label}</div>
    </div>
  );
}
