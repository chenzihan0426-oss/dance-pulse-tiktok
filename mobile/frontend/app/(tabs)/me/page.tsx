"use client";

import * as React from "react";
import Link from "next/link";
import {
  type LucideIcon,
  CheckCircle2,
  Flame,
  LogOut,
  Medal,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Video,
  Zap,
} from "lucide-react";
import { CommunityResultCard } from "@/components/community/CommunityResultCard";
import { Button } from "@/components/ui/button";
import { getCommunityUserProfile, getMe } from "@/lib/api";
import { AUTH_CHANGED_EVENT } from "@/lib/auth";
import { getBadgeDefinition } from "@/lib/badges";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { BadgeId } from "@/lib/m5-types";
import { useAuth } from "@/hooks/useAuth";
import type { CommunityFeedItem, MeResponse } from "@/lib/types";

const BADGE_VISUALS = {
  first_learned: { icon: Sparkles, bg: "bg-[#3A2152]", color: "text-[#D9A8FF]" },
  half_done: { icon: ScanLine, bg: "bg-[#112C45]", color: "text-[#8CC8FF]" },
  lesson_complete: { icon: CheckCircle2, bg: "bg-[#0C3934]", color: "text-[#68F0C1]" },
  chorus_master: { icon: Medal, bg: "bg-[#4A3718]", color: "text-[#FFC83D]" },
  three_day_streak: { icon: Flame, bg: "bg-[#471924]", color: "text-[#FF7676]" },
  kpop_expert: { icon: Star, bg: "bg-[#3A2152]", color: "text-[#D9A8FF]" },
} as const satisfies Record<BadgeId, { icon: LucideIcon; bg: string; color: string }>;

const MOCK_ACTIVITIES: {
  id: string;
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  time: string;
  score?: number;
}[] = [
  {
    id: "1",
    icon: <Trophy className="h-4 w-4 text-amber-400" />,
    bgColor: "bg-amber-500/15",
    title: "解锁成就「副歌王者」",
    time: "2 小时前",
  },
  {
    id: "2",
    icon: <Video className="h-4 w-4 text-pink-400" />,
    bgColor: "bg-pink-500/15",
    title: "跟拍 ANTIFRAGILE 副歌",
    time: "今天 14:32",
    score: 87,
  },
  {
    id: "3",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    bgColor: "bg-emerald-500/15",
    title: "完成课程 LOVE DIVE",
    time: "昨天 21:15",
  },
  {
    id: "4",
    icon: <Zap className="h-4 w-4 text-brand" />,
    bgColor: "bg-brand/15",
    title: "学会 4 张动作卡",
    time: "昨天 20:48",
  },
  {
    id: "5",
    icon: <Flame className="h-4 w-4 text-red-400" />,
    bgColor: "bg-red-500/15",
    title: "连续学习达到 7 天",
    time: "2 天前",
  },
] ;

const MOCK_ACHIEVEMENTS = [
  {
    id: "a1",
    emoji: "🏆",
    bgColor: "bg-amber-500/15",
    title: "副歌王者",
    desc: "在副歌段跟拍 ≥90 分",
    rarity: "黄金",
    unlocked: true,
  },
  {
    id: "a2",
    emoji: "🔥",
    bgColor: "bg-red-500/15",
    title: "七日不辍",
    desc: "连续学习 7 天",
    rarity: "白银",
    unlocked: true,
  },
  {
    id: "a3",
    emoji: "💯",
    bgColor: "bg-emerald-500/15",
    title: "完美主义",
    desc: "单次跟拍拿到 100 分",
    unlocked: false,
    progress: 75,
    progressLabel: "87 / 100",
  },
  {
    id: "a4",
    emoji: "📚",
    bgColor: "bg-brand/15",
    title: "百卡达人",
    desc: "累计学会 100 张动作卡",
    unlocked: false,
    progress: 73,
    progressLabel: "73 / 100",
  },
] as const;

function formatJoinedDays(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)));
}

function levelLabel(learnedSegments: number) {
  if (learnedSegments >= 100) return "K-pop 老手";
  if (learnedSegments >= 40) return "进阶练习生";
  if (learnedSegments >= 10) return "舞蹈熟练者";
  return "舞蹈新手";
}

export default function MePage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [data, setData] = React.useState<MeResponse | null>(null);
  const [publishedWorks, setPublishedWorks] = React.useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isAuthenticated || !user) {
      setData(null);
      setPublishedWorks([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const me = await getMe();
        const profile = await getCommunityUserProfile(me.user.username);
        if (!cancelled) {
          setData(me);
          setPublishedWorks(profile.results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    const reload = () => {
      void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener(PROGRESS_UPDATED_EVENT, reload as EventListener);
    window.addEventListener(AUTH_CHANGED_EVENT, reload as EventListener);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(PROGRESS_UPDATED_EVENT, reload as EventListener);
      window.removeEventListener(AUTH_CHANGED_EVENT, reload as EventListener);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, user]);

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
        <div className="rounded-[32px] border border-white/8 bg-bg-raised px-6 py-7">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/16 text-brand-light">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-[30px] font-semibold tracking-tight text-white">登录账号</h1>
          <p className="mt-3 text-[14px] leading-6 text-white/45">
            登录后可以同步学习进度、连续学习和徽章，跟拍作品和社区主页也会跟着账号走。
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Link href="/auth/login">
              <Button variant="primary" className="h-14 w-full rounded-[18px] text-[15px]">
                手机号登录
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="secondary" className="h-12 w-full rounded-[18px] text-[14px]">
                创建账号
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
        <div className="h-[220px] animate-pulse rounded-[32px] bg-bg-raised" />
      </main>
    );
  }

  const joinedDays = formatJoinedDays(data.user.createdAt);
  const badgeIds = data.badges.slice(0, 4);
  const stats = [
    { label: "已学动作", value: String(data.stats.learnedSegments), unit: "张" },
    {
      label: "学习时长",
      value: String(Math.floor(data.stats.totalStudyMinutes / 60)),
      unit: `${data.stats.totalStudyMinutes % 60}m`,
    },
    { label: "徽章", value: String(data.stats.badgesCount), unit: "枚" },
    { label: "课程", value: String(data.stats.lessonsCount), unit: "门" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-white">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand text-[28px] font-semibold text-white">
          {data.user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.user.avatar} alt={data.user.displayName} className="h-full w-full object-cover" />
          ) : (
            data.user.displayName.slice(0, 1).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[28px] font-semibold tracking-tight text-white">
              {data.user.displayName}
            </h1>
            {data.user.isVerified ? <ShieldCheck className="h-5 w-5 text-brand-light" /> : null}
          </div>
          <p className="mt-1 text-[14px] text-white/45">
            @{data.user.username} · 加入 {joinedDays} 天 · {levelLabel(data.stats.learnedSegments)}
          </p>
          {data.user.bio ? <p className="mt-2 text-[13px] leading-6 text-white/50">{data.user.bio}</p> : null}
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="退出登录"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="mt-8 rounded-[28px] border border-white/6 bg-bg-raised px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[14px] text-white/45">连续学习</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-[72px] font-semibold leading-none tracking-tight text-white">
                {data.streak.currentDays}
              </span>
              <span className="mb-2 text-[28px] font-medium text-white/55">天</span>
            </div>
          </div>

          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#3B1C2A] text-[#FF7676]">
            <Flame className="h-8 w-8 fill-current" />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-7 gap-2">
          {data.streak.thisWeek.map((active, index) => (
            <div key={index} className={active ? "h-3 rounded-full bg-[#FF554D]" : "h-3 rounded-full bg-white/8"} />
          ))}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-[24px] bg-bg-surface px-5 py-5">
            <p className="text-[14px] text-white/45">{item.label}</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-[44px] font-semibold leading-none tracking-tight text-white">
                {item.value}
              </span>
              <span className="mb-1 text-[18px] font-medium text-white/45">{item.unit}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">我的徽章</h2>
          <button type="button" className="text-[14px] text-white/45 transition hover:text-white">
            查看全部
          </button>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {badgeIds.map((badgeId) => {
            const typedBadgeId = badgeId as BadgeId;
            const definition = getBadgeDefinition(typedBadgeId);
            const visual = BADGE_VISUALS[typedBadgeId] ?? BADGE_VISUALS.first_learned;
            const Icon = visual.icon;
            return (
              <div
                key={badgeId}
                title={definition.title}
                className={`flex aspect-square items-center justify-center rounded-[24px] ${visual.bg}`}
              >
                <Icon className={`h-8 w-8 ${visual.color}`} />
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, 5 - badgeIds.length) }, (_, index) => (
            <div key={index} className="rounded-[24px] bg-white/[0.03]" />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/5 bg-bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="mb-1 text-xs text-white/50">当前等级</div>
            <div className="flex items-baseline gap-2 text-2xl font-semibold">
              Lv.4
              <span className="text-sm font-normal text-white/60">练习生</span>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-xs text-white/50">经验值</div>
            <div className="text-xl font-semibold tabular-nums">
              <span className="text-brand">680</span>
              <span className="text-sm text-white/40"> / 1000</span>
            </div>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-accent-pink"
            style={{ width: "68%" }}
          />
        </div>
        <div className="mt-2 text-xs text-white/45">距离 Lv.5 舞者 还差 320 XP</div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBlock label="累计练习" value="4h 32m" />
        <StatBlock label="舞龄" value="23 天" />
        <StatBlock label="完课数量" value="2 支" />
        <StatBlock label="跟拍次数" value="5 次" />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">最近活动</h3>
          <span className="text-xs text-white/40">查看全部</span>
        </div>
        <div className="space-y-2">
          {MOCK_ACTIVITIES.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 rounded-xl border border-white/5 bg-bg-surface p-3"
            >
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                  activity.bgColor
                )}
              >
                {activity.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">{activity.title}</div>
                <div className="mt-0.5 text-xs text-white/40">{activity.time}</div>
              </div>
              {activity.score ? (
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    activity.score >= 90 ? "text-state-success" : "text-brand"
                  )}
                >
                  {activity.score}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">成就进度</h3>
          <span className="text-xs text-white/40">12 / 48 已解锁</span>
        </div>
        <div className="space-y-2">
          {MOCK_ACHIEVEMENTS.map((achievement) => (
            <div
              key={achievement.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-bg-surface p-3"
            >
              <div
                className={cn(
                  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                  achievement.unlocked ? achievement.bgColor : "bg-white/5"
                )}
              >
                <span className={cn("text-lg", !achievement.unlocked && "grayscale opacity-30")}>
                  {achievement.emoji}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      !achievement.unlocked && "text-white/60"
                    )}
                  >
                    {achievement.title}
                  </span>
                  {achievement.unlocked ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                      {achievement.rarity}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-white/45">{achievement.desc}</div>
                {!achievement.unlocked ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${achievement.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-white/50">
                      {achievement.progressLabel}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">我的公开作品</h2>
          <Link href={`/u/${data.user.username}`} className="text-[14px] text-white/45 transition hover:text-white">
            查看主页
          </Link>
        </div>

        {publishedWorks.length === 0 ? (
          <div className="rounded-[24px] bg-bg-surface px-5 py-5 text-sm text-white/45">
            还没有公开作品。先去课程里完成一次跟拍挑战，再发布到社区。
          </div>
        ) : (
          <div className="space-y-4">
            {publishedWorks.slice(0, 3).map((item) => (
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

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-bg-surface p-3">
      <div className="mb-1 text-xs text-white/45">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
