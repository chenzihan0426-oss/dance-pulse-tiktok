"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Award,
  BadgeCheck,
  Camera,
  ChevronRight,
  Clapperboard,
  Crown,
  Flag,
  Flame,
  Heart,
  MapPin,
  Mic2,
  Moon,
  Music2,
  Pencil,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { CommunityFeedGrid } from "@/components/community/CommunityFeedGrid";
import { ProfileEditPanel } from "@/components/profile/ProfileEditPanel";
import { resolveMediaUrl } from "@/lib/api";
import type { ProfilePageModel } from "@/lib/communityShowcase";
import { pickDemoThumb, rotateFeedThumbs, useDemoCoverPool } from "@/lib/demoMedia";
import {
  PREMIUM_CHANGED_EVENT,
  PROFILE_CUSTOM_CHANGED_EVENT,
  getPremiumState,
  getProfileCustomization,
  premiumTierLabel,
  resolveCoverBackground,
} from "@/lib/profileCustomization";

type BottomTab = "works" | "moments" | "info";

const MEDAL_GLOW: Record<"gold" | "cyan" | "rose" | "lime", string> = {
  gold: "#ccff00",
  cyan: "#00f3ff",
  rose: "#ff0055",
  lime: "#ffffff",
};

const MEDAL_ICONS: Record<string, LucideIcon> = {
  shield: ShieldCheck,
  trophy: Trophy,
  users: Users,
  flame: Flame,
  moon: Moon,
  target: Target,
  award: Award,
  music: Music2,
  audio: AudioLines,
  sparkles: Sparkles,
  wrench: Wrench,
  flag: Flag,
  rocket: Rocket,
  mic: Mic2,
  clapper: Clapperboard,
  rotate: RotateCcw,
  user: UserRound,
  badge: BadgeCheck,
  star: Star,
};

function formatCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function ProfileArenaPage({
  model,
  isOwn,
  following,
  onFollow,
  onLogout,
  backHref = "/community",
}: {
  model: ProfilePageModel;
  isOwn?: boolean;
  following?: boolean;
  onFollow?: () => void;
  onLogout?: () => void;
  backHref?: string;
}) {
  const [tab, setTab] = React.useState<BottomTab>("works");
  const [editOpen, setEditOpen] = React.useState(false);
  const [customTick, setCustomTick] = React.useState(0);
  const { thumbs } = useDemoCoverPool();

  const displayModel = React.useMemo(() => {
    if (!thumbs.length) return model;
    return {
      ...model,
      meta: {
        ...model.meta,
        coverThumb:
          pickDemoThumb(`profile-cover-${model.user.username}`, thumbs, model.meta.coverThumb) ??
          model.meta.coverThumb,
      },
      works: rotateFeedThumbs(model.works, thumbs),
      liked: rotateFeedThumbs(model.liked, thumbs),
      recent: model.recent.map((item) => ({
        ...item,
        thumb: pickDemoThumb(`recent-${item.resultId}`, thumbs, item.thumb) ?? item.thumb,
      })),
    };
  }, [model, thumbs]);

  const [premiumTick, setPremiumTick] = React.useState(0);
  const [activeMedal, setActiveMedal] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOwn) return;
    const onCustom = () => setCustomTick((n) => n + 1);
    const onPremium = () => setPremiumTick((n) => n + 1);
    window.addEventListener(PROFILE_CUSTOM_CHANGED_EVENT, onCustom as EventListener);
    window.addEventListener(PREMIUM_CHANGED_EVENT, onPremium as EventListener);
    return () => {
      window.removeEventListener(PROFILE_CUSTOM_CHANGED_EVENT, onCustom as EventListener);
      window.removeEventListener(PREMIUM_CHANGED_EVENT, onPremium as EventListener);
    };
  }, [isOwn]);

  const custom = React.useMemo(() => (isOwn ? getProfileCustomization() : {}), [isOwn, customTick]);
  const premiumLocal = React.useMemo(() => (isOwn ? getPremiumState() : null), [isOwn, premiumTick]);

  const displayName = custom.displayName?.trim() || displayModel.user.displayName;
  const avatar = custom.avatar !== undefined ? custom.avatar : displayModel.user.avatar;
  const coverBg = resolveCoverBackground(custom.coverThumb || displayModel.meta.coverThumb);
  const isFollowing = following ?? displayModel.user.isFollowing;

  const premiumActive = isOwn && premiumLocal ? premiumLocal.active : displayModel.premium.active;
  const premiumTier =
    isOwn && premiumLocal && premiumLocal.active
      ? premiumTierLabel(premiumLocal.tier)
      : displayModel.premium.tier;
  const premiumExpires =
    isOwn && premiumLocal ? premiumLocal.expiresLabel : displayModel.premium.expiresLabel;
  const premiumPerks =
    premiumActive
      ? premiumTier.includes("Pro")
        ? ["无限跟跳存档", "分段精析回放", "训练营优先位", "专属霓虹勋章框"]
        : ["无限跟跳存档", "分段精析回放", "去广告练舞页"]
      : displayModel.premium.perks;

  return (
    <main className="relative mx-auto min-h-screen max-w-md pb-6 text-white">
      <section className="relative">
        <div className="relative h-[240px] overflow-hidden md:h-[300px]">
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={
              coverBg.kind === "image"
                ? { backgroundImage: `url("${coverBg.value}")` }
                : { background: coverBg.value }
            }
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.25)_0%,rgba(5,5,5,0.55)_45%,rgba(5,5,5,0.98)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(255,0,85,0.22),transparent_55%)]" />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5 md:px-8">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[13px] text-white/70 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            <div className="flex items-center gap-3">
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1.5 border border-white/20 bg-black/40 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur transition hover:border-white/40 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑主页
                </button>
              ) : null}
              {isOwn && onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-[12px] text-white/50 transition hover:text-white"
                >
                  退出登录
                </button>
              ) : null}
            </div>
          </div>

          {isOwn ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="absolute bottom-4 right-5 inline-flex items-center gap-1.5 bg-black/50 px-2.5 py-1.5 text-[11px] text-white/80 backdrop-blur transition hover:bg-black/70 md:right-8"
            >
              <Camera className="h-3.5 w-3.5" />
              换背景
            </button>
          ) : null}
        </div>

        <div className="relative -mt-16 px-5 md:-mt-20 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <button
                type="button"
                disabled={!isOwn}
                onClick={() => isOwn && setEditOpen(true)}
                className={`relative flex h-24 w-24 items-center justify-center border-2 border-[#050505] bg-brand text-[36px] font-black text-white md:h-28 md:w-28 ${
                  isOwn ? "cursor-pointer" : ""
                } ${premiumActive ? "ring-2 ring-[#ccff00] ring-offset-2 ring-offset-[#050505]" : ""}`}
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
                {isOwn ? (
                  <span className="absolute bottom-1 right-1 bg-black/70 p-1 text-white/90">
                    <Camera className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    className="text-[26px] font-medium tracking-wide text-white md:text-[30px]"
                    style={{ fontFamily: "'Noto Sans SC', 'PingFang SC', sans-serif", fontWeight: 500 }}
                  >
                    {displayName}
                  </h1>
                  {displayModel.user.isVerified ? <ShieldCheck className="h-5 w-5 text-[#00f3ff]" /> : null}
                  {premiumActive ? (
                    <span className="inline-flex items-center gap-1 bg-[#ccff00] px-2 py-0.5 text-[10px] font-bold text-black">
                      <Crown className="h-3 w-3" />
                      {premiumTier}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[13px] text-white/45">@{displayModel.user.username}</div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/50">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {displayModel.meta.city}
                  </span>
                  <span className="inline-flex items-center gap-1 text-orange-200">
                    <Flame className="h-3 w-3" />
                    连打 {displayModel.meta.streakDays} 天
                  </span>
                  <span className="text-white/35">{displayModel.meta.role}</span>
                </div>
              </div>
            </div>

            {!isOwn && onFollow ? (
              <button
                type="button"
                onClick={onFollow}
                className={`px-6 py-2.5 text-[13px] font-bold transition ${
                  isFollowing
                    ? "border border-white/20 text-white/70 hover:bg-white/5"
                    : "bg-[#ccff00] text-black hover:bg-white"
                }`}
                style={{ transform: "skewX(-6deg)" }}
              >
                <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>
                  {isFollowing ? "已关注" : "关注"}
                </span>
              </button>
            ) : isOwn ? (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="border border-white/20 px-5 py-2.5 text-[13px] font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
                style={{ transform: "skewX(-6deg)" }}
              >
                <span className="inline-flex items-center gap-1.5" style={{ transform: "skewX(6deg)" }}>
                  <Pencil className="h-3.5 w-3.5" />
                  改昵称 / 头像
                </span>
              </button>
            ) : null}
          </div>

          {displayModel.user.bio ? (
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-white/65">{displayModel.user.bio}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-6 md:gap-10">
            <StatInline label="粉丝" value={displayModel.user.stats.followerCount} />
            <StatInline label="关注" value={displayModel.user.stats.followingCount} />
            <StatInline label="获赞" value={displayModel.user.stats.totalLikesReceived} />
            <StatInline label="作品" value={displayModel.user.stats.publishedTrackingCount} />
          </div>

          <div className="mt-5 flex items-center gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {displayModel.medals.map((medal) => {
              const Icon = MEDAL_ICONS[medal.icon] ?? Star;
              const glow = MEDAL_GLOW[medal.tone];
              const open = activeMedal === medal.name;
              return (
                <button
                  key={medal.name}
                  type="button"
                  title={medal.name}
                  onClick={() => setActiveMedal(open ? null : medal.name)}
                  className={`relative flex shrink-0 items-center justify-center bg-transparent p-0 transition ${
                    open ? "scale-110" : "hover:scale-105"
                  }`}
                  style={{
                    color: glow,
                    filter: `drop-shadow(0 0 6px ${glow}) drop-shadow(0 0 14px ${glow}99)`,
                  }}
                >
                  <Icon className="h-6 w-6" fill="currentColor" strokeWidth={0} />
                </button>
              );
            })}
          </div>

          {activeMedal ? (
            <div className="mt-3 border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
              {(() => {
                const medal = displayModel.medals.find((m) => m.name === activeMedal);
                if (!medal) return null;
                const Icon = MEDAL_ICONS[medal.icon] ?? Star;
                const glow = MEDAL_GLOW[medal.tone];
                return (
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex items-center justify-center bg-transparent"
                      style={{
                        color: glow,
                        filter: `drop-shadow(0 0 8px ${glow})`,
                      }}
                    >
                      <Icon className="h-7 w-7" fill="currentColor" strokeWidth={0} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-white">{medal.name}</div>
                      <p className="mt-1 text-[12px] leading-5 text-white/50">
                        {medalDetail(medal.name)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMedal(null)}
                      className="text-[12px] text-white/40 hover:text-white"
                    >
                      收起
                    </button>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-8 space-y-5 px-5 md:px-8">
        <div>
          <SectionTitle
            title="最近记录"
            hint="Recent"
            href={displayModel.recent[0] ? `/community/result/${displayModel.recent[0].resultId}` : undefined}
          />
          {displayModel.recent.length === 0 ? (
            <EmptyStrip text="还没有练习记录" />
          ) : (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {displayModel.recent.map((item) => {
                const thumb = item.thumb ? resolveMediaUrl(item.thumb) : null;
                return (
                  <Link
                    key={item.id}
                    href={`/community/result/${item.resultId}`}
                    className="group relative h-[148px] w-[112px] shrink-0 overflow-hidden border border-white/10 bg-black/40"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center transition group-hover:scale-105"
                      style={
                        thumb
                          ? { backgroundImage: `url("${thumb}")` }
                          : { background: "linear-gradient(160deg,#1a1020,#050505)" }
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    <div className="absolute left-2 top-2 font-mono text-[18px] font-black text-[#ccff00]">
                      {item.score}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <div className="line-clamp-2 text-[11px] font-medium text-white/90">{item.title}</div>
                      <div className="mt-1 text-[10px] text-white/40">{item.timeLabel}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <Link
          href="/premium"
          className="relative block overflow-hidden border border-[#ccff00]/30 bg-[linear-gradient(110deg,rgba(204,255,0,0.14),rgba(5,5,5,0.92)_55%)] px-5 py-4 transition active:border-[#ccff00]/55"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ccff00]">
                <Crown className="h-3.5 w-3.5" />
                Premium 中心
              </div>
              <div className="mt-2 text-[18px] font-bold text-white">
                {premiumActive ? `${premiumTier} · 已开通` : "开通 Premium，练得更狠"}
              </div>
              <div className="mt-1 text-[12px] text-white/50">
                {premiumExpires} · {premiumPerks.slice(0, 2).join(" · ")}
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 bg-[#ccff00] px-4 py-2 text-[12px] font-bold text-black"
              style={{ transform: "skewX(-6deg)" }}
            >
              <span className="inline-flex items-center gap-1" style={{ transform: "skewX(6deg)" }}>
                {isOwn ? (premiumActive ? "管理权益" : "立即开通") : "去练舞"}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </span>
          </div>
        </Link>

        <div>
          <SectionTitle title="已点舞蹈" hint="Liked" />
          {displayModel.liked.length === 0 ? (
            <EmptyStrip text="还没有点过舞" />
          ) : (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {displayModel.liked.map((item) => {
                const thumb = item.previewThumbnail ? resolveMediaUrl(item.previewThumbnail) : null;
                return (
                  <Link
                    key={item.result.id}
                    href={`/community/result/${item.result.id}`}
                    className="group relative h-[132px] w-[100px] shrink-0 overflow-hidden border border-white/10"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center transition group-hover:scale-105"
                      style={
                        thumb
                          ? { backgroundImage: `url("${thumb}")` }
                          : { background: "linear-gradient(160deg,#1a1020,#050505)" }
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                    <div className="absolute left-2 top-2 inline-flex items-center gap-0.5 text-[10px] text-white/80">
                      <Heart className="h-3 w-3 fill-[#ff0055] text-[#ff0055]" />
                      {formatCount(item.result.likeCount)}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <div className="line-clamp-2 text-[11px] text-white/85">{item.lessonTitle}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 px-5 md:px-8">
        <div className="flex gap-1 border-b border-white/10">
          {(
            [
              { id: "works" as const, label: "作品", count: displayModel.works.length },
              { id: "moments" as const, label: "动态", count: displayModel.meta.moments.length },
              { id: "info" as const, label: "资料", count: null },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative px-5 py-3 text-[14px] font-semibold transition ${
                  active ? "text-[#ccff00]" : "text-white/45 hover:text-white"
                }`}
              >
                {item.label}
                {item.count != null ? (
                  <span className="ml-1 font-mono text-[11px] text-white/30">{item.count}</span>
                ) : null}
                {active ? <span className="absolute inset-x-4 -bottom-px h-0.5 bg-[#ccff00]" /> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {tab === "works" ? (
            displayModel.works.length === 0 ? (
              <EmptyStrip text="还没有公开作品" />
            ) : (
              <CommunityFeedGrid items={displayModel.works} />
            )
          ) : null}

          {tab === "moments" ? (
            <div className="space-y-0 divide-y divide-white/8 border border-white/8 bg-black/35">
              {displayModel.meta.moments.length === 0 ? (
                <div className="px-4 py-8 text-sm text-white/40">还没有动态</div>
              ) : (
                displayModel.meta.moments.map((moment) => (
                  <div key={moment.id} className="px-4 py-4">
                    <div className="flex items-center gap-2 text-[12px] text-white/40">
                      <Sparkles className="h-3.5 w-3.5 text-[#ccff00]" />
                      {moment.timeLabel}
                    </div>
                    <p className="mt-2 text-[14px] leading-6 text-white/80">{moment.text}</p>
                  </div>
                ))
              )}
              {displayModel.meta.camp ? (
                <div className="px-4 py-4">
                  <div className="text-[12px] text-white/40">训练营进度</div>
                  <div className="mt-2 flex items-center justify-between text-[13px] text-white/75">
                    <span>{displayModel.meta.camp.name}</span>
                    <span className="font-mono">
                      {displayModel.meta.camp.done}/{displayModel.meta.camp.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-white/10">
                    <div
                      className="h-full bg-[#00f3ff]"
                      style={{
                        width: `${Math.round((displayModel.meta.camp.done / displayModel.meta.camp.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              <div className="px-4 py-4">
                <div className="text-[12px] text-white/40">本周打卡</div>
                <div className="mt-3 flex gap-1.5">
                  {displayModel.meta.thisWeekCheckins.map((done, index) => (
                    <div
                      key={index}
                      className={`h-9 flex-1 ${done ? "bg-[#ccff00]/80" : "bg-white/10"}`}
                      title={`周${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "info" ? (
            <div className="border border-white/10 bg-black/40">
              {displayModel.meta.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-center justify-between border-b border-white/6 px-4 py-3.5 last:border-b-0"
                >
                  <span className="text-[13px] text-white/45">{fact.label}</span>
                  <span className="text-[14px] text-white/85">{fact.value}</span>
                </div>
              ))}
              {displayModel.meta.school ? (
                <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5">
                  <span className="text-[13px] text-white/45">机构 / 社团</span>
                  <span className="text-[14px] text-white/85">{displayModel.meta.school}</span>
                </div>
              ) : null}
              {isOwn ? (
                <div className="flex items-center justify-between border-t border-white/6 px-4 py-3.5">
                  <span className="text-[13px] text-white/45">主页外观</span>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="text-[13px] text-[#ccff00] hover:underline"
                  >
                    编辑昵称 / 头像 / 背景
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {isOwn ? (
        <ProfileEditPanel
          open={editOpen}
          onClose={() => setEditOpen(false)}
          displayName={displayName}
          currentCover={custom.coverThumb || displayModel.meta.coverThumb}
          onSaved={() => setCustomTick((n) => n + 1)}
        />
      ) : null}
    </main>
  );
}

function medalDetail(name: string): string {
  if (/教练|导师|助教/.test(name)) return "教学向认证勋章。持续发布示范与纠错内容可保持亮起。";
  if (/周冠|冠军|高光|纪录/.test(name)) return "竞技向成就。登上周榜或打出高光成绩后点亮。";
  if (/社团|主理/.test(name)) return "社团活跃勋章。组织练舞、带队打卡可点亮。";
  if (/连练|连打|连续|七天|21|三天/.test(name)) return "坚持向勋章。连续打卡达到天数后点亮。";
  if (/夜猫|夜练/.test(name)) return "深夜练习勋章。在晚间时段完成跟跳可点亮。";
  if (/备赛|选手/.test(name)) return "备赛向勋章。高频练习指定曲目时点亮。";
  if (/90\+|高分|破 80|破80/.test(name)) return "分数里程碑。单次跟跳达到对应分数后点亮。";
  if (/街舞|跨界|节奏|拍感/.test(name)) return "风格向勋章。展现特定舞种或拍感优势时点亮。";
  if (/新人|入门|上路|演示/.test(name)) return "起步勋章。完成首次公开作品后点亮。";
  return "DancePulse 成就勋章。完成对应挑战后点亮，点击可查看说明。";
}

function StatInline({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-[22px] font-black leading-none text-white">{formatCount(value)}</div>
      <div className="mt-1.5 text-[12px] text-white/40">{label}</div>
    </div>
  );
}

function SectionTitle({
  title,
  hint,
  href,
}: {
  title: string;
  hint: string;
  href?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{hint}</div>
        <h2 className="mt-1 text-[18px] font-bold text-white">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="text-[12px] text-white/40 transition hover:text-white">
          查看全部
        </Link>
      ) : null}
    </div>
  );
}

function EmptyStrip({ text }: { text: string }) {
  return (
    <div className="mt-3 border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-white/35">
      {text}
    </div>
  );
}
