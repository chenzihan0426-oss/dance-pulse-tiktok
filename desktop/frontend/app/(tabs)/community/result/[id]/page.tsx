"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Heart,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CommunityFeedGrid } from "@/components/community/CommunityFeedGrid";
import { getShowcaseSameSong, SHOWCASE_WORK_META } from "@/lib/communityShowcase";
import { getLesson, resolveMediaUrl } from "@/lib/api";
import { useCommunityDetail } from "@/lib/useCommunityFeed";
import type { CommunityComment } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

export default function CommunityResultDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-[1200px] items-center justify-center px-10 text-white/45">
          <Loader2 className="h-5 w-5 animate-spin" />
        </main>
      }
    >
      <CommunityResultDetailInner />
    </Suspense>
  );
}

function formatScoreAccent(score: number) {
  if (score >= 94) return "#ccff00";
  if (score >= 88) return "#00f3ff";
  if (score >= 80) return "#ffaa00";
  return "#ffffff";
}

function formatCommentTime(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function CommunityResultDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resultId = params?.id ?? "";
  const { user } = useAuth();
  const { detail, loading, error, like, follow, comment } = useCommunityDetail(resultId);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [burst, setBurst] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [openingLesson, setOpeningLesson] = React.useState(false);
  const lastTap = React.useRef(0);

  const meta = detail ? SHOWCASE_WORK_META[detail.item.result.id] : undefined;
  const sameSong = detail
    ? getShowcaseSameSong(detail.item.result.lessonId, detail.item.result.id).slice(0, 4)
    : [];

  async function handleLike() {
    await like();
    setBurst(true);
    window.setTimeout(() => setBurst(false), 450);
  }

  function handleDoubleTapLike() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      void handleLike();
    }
    lastTap.current = now;
  }

  async function handleComment() {
    if (!commentDraft.trim()) return;
    setSending(true);
    try {
      await comment(commentDraft);
      setCommentDraft("");
    } finally {
      setSending(false);
    }
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function handleOpenLessonDetail() {
    if (!detail || openingLesson) return;
    const lessonId = detail.item.result.lessonId;
    setOpeningLesson(true);
    try {
      const lesson = await getLesson(lessonId);
      const hasPage =
        Boolean(lesson?.id) &&
        Array.isArray(lesson.segments) &&
        lesson.segments.some((s) => !s.deleted);
      if (!hasPage) {
        flash("页面不存在");
        return;
      }
      router.push(`/lesson/${lesson.id}`);
    } catch {
      flash("页面不存在");
    } finally {
      setOpeningLesson(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-[1200px] px-10 py-12 text-white">
        <div className="flex h-48 items-center justify-center border border-white/10 bg-black/40 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="mx-auto min-h-screen max-w-[1200px] px-10 py-12 text-white">
        <div className="border border-[#ff0055]/30 bg-[#ff0055]/10 px-4 py-5 text-sm text-red-200">
          {error ?? "作品加载失败"}
        </div>
      </main>
    );
  }

  const isOwnProfile = user?.username === detail.item.user.username;
  const poster = detail.item.previewThumbnail
    ? resolveMediaUrl(detail.item.previewThumbnail)
    : undefined;
  const videoSrc = resolveMediaUrl(detail.item.result.videoUrl);
  const tallies = meta?.gradeTallies;
  const accent = formatScoreAccent(detail.item.result.score);

  return (
    <main className="mx-auto min-h-screen max-w-[1200px] px-5 pb-14 pt-8 text-white">
      <Link
        href="/community"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回社区
      </Link>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section
          className="relative overflow-hidden border border-white/10 bg-black"
          onClick={handleDoubleTapLike}
        >
          <div className="aspect-[9/16] bg-black">
            <video
              src={videoSrc}
              poster={poster}
              className="h-full w-full object-contain"
              controls
              playsInline
            />
          </div>
          {burst ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Heart className="h-20 w-20 fill-[#ff0055] text-[#ff0055] opacity-90 drop-shadow-[0_0_30px_rgba(255,0,85,0.8)]" />
            </div>
          ) : null}
          <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
            {(meta?.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-black"
                style={{
                  backgroundColor: tag.includes("周冠") ? "#ccff00" : "#00f3ff",
                  transform: "skewX(-8deg)",
                }}
              >
                <span style={{ transform: "skewX(8deg)", display: "inline-block" }}>{tag}</span>
              </span>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="border border-white/10 bg-black/45 px-5 py-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link
                  href={`/u/${detail.item.user.username}`}
                  className="text-[22px] font-black text-white hover:text-[#ccff00]"
                  style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif" }}
                >
                  {detail.item.user.displayName}
                </Link>
                <div className="mt-1 text-[13px] text-white/45">@{detail.item.user.username}</div>
                <div className="mt-2 text-[14px] text-white/70">{detail.item.lessonTitle}</div>
                {meta?.caption ? (
                  <p className="mt-3 text-[14px] leading-6 text-white/55">{meta.caption}</p>
                ) : null}
              </div>
              {!isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => void follow()}
                  className={`px-4 py-2 text-[12px] font-bold transition ${
                    detail.item.user.isFollowing
                      ? "border border-white/20 text-white/70 hover:bg-white/5"
                      : "bg-[#ccff00] text-black hover:bg-white"
                  }`}
                  style={{ transform: "skewX(-6deg)" }}
                >
                  <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>
                    {detail.item.user.isFollowing ? "已关注" : "关注"}
                  </span>
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="border border-white/10 bg-black/40 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Score</div>
                <div
                  className="mt-2 font-mono text-[40px] font-black leading-none"
                  style={{ color: accent, textShadow: `0 0 20px ${accent}55` }}
                >
                  {detail.item.result.score}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLike()}
                className="border border-white/10 bg-black/40 px-4 py-4 text-left transition hover:border-[#ff0055]/40"
              >
                <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-white/40">
                  <Heart className={`h-3.5 w-3.5 ${detail.item.likedByMe ? "fill-[#ff0055] text-[#ff0055]" : ""}`} />
                  Likes
                </div>
                <div className="mt-2 font-mono text-[40px] font-black leading-none text-white">
                  {detail.item.result.likeCount}
                </div>
              </button>
              <div className="border border-white/10 bg-black/40 px-4 py-4">
                <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-white/40">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Chat
                </div>
                <div className="mt-2 font-mono text-[40px] font-black leading-none text-white">
                  {detail.item.result.commentCount}
                </div>
              </div>
            </div>

            {tallies ? (
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide">
                <span className="bg-[#ccff00]/15 px-3 py-1 text-[#ccff00]">PERFECT {tallies.PERFECT}</span>
                <span className="bg-[#00f3ff]/15 px-3 py-1 text-[#00f3ff]">GOOD {tallies.GOOD}</span>
                <span className="bg-[#ffaa00]/15 px-3 py-1 text-[#ffaa00]">OK {tallies.OK}</span>
                <span className="bg-[#ff0055]/15 px-3 py-1 text-[#ff0055]">MISS {tallies.MISS}</span>
              </div>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void handleOpenLessonDetail()}
                disabled={openingLesson}
                className="flex flex-1 items-center justify-center gap-2 border border-[#ccff00] bg-transparent px-3 py-3 text-[14px] font-bold text-[#ccff00] transition hover:bg-[#ccff00] hover:text-black disabled:opacity-60"
                style={{ transform: "skewX(-6deg)" }}
              >
                <span className="inline-flex items-center gap-2" style={{ transform: "skewX(6deg)" }}>
                  {openingLesson ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="h-4 w-4" />
                  )}
                  查看详情
                </span>
              </button>
              <Link
                href={`/lesson/${detail.item.result.lessonId}/tracking-desktop`}
                className="flex flex-1 items-center justify-center gap-2 bg-[#ccff00] px-3 py-3 text-[14px] font-bold text-black transition hover:bg-white"
                style={{ transform: "skewX(-6deg)" }}
              >
                <span className="inline-flex items-center gap-2" style={{ transform: "skewX(6deg)" }}>
                  <Zap className="h-4 w-4" />
                  跟跳这支
                </span>
              </Link>
            </div>
          </section>

          <section className="border border-white/10 bg-black/45 px-5 py-5 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-white">
              <Sparkles className="h-4 w-4 text-[#ccff00]" />
              分段得分
            </div>
            <div className="space-y-2">
              {detail.item.result.segmentScores.slice(0, 6).map((item) => {
                const segAccent = formatScoreAccent(item.score);
                return (
                  <div key={item.segmentId} className="border border-white/8 bg-black/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-[13px] text-white/70">{item.segmentId}</div>
                      <div className="font-mono text-[20px] font-black" style={{ color: segAccent }}>
                        {item.score}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-white/40">时序偏差约 {item.timingMs}ms</div>
                    <div className="mt-3 h-1 bg-white/10">
                      <div className="h-full" style={{ width: `${item.score}%`, backgroundColor: segAccent }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-5 border border-white/10 bg-black/45 px-5 py-5 backdrop-blur-sm">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[16px] font-bold text-white">
            评论{" "}
            <span className="font-mono text-[13px] font-normal text-white/40">{detail.comments.length}</span>
          </div>
          <div className="text-[11px] text-white/35">精选置顶 · 其余按时间</div>
        </div>
        <div className="mt-4 flex gap-3">
          <input
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="友好互关，别骂人…"
            className="h-11 flex-1 border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#00f3ff]/40"
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleComment();
            }}
          />
          <button
            type="button"
            onClick={() => void handleComment()}
            disabled={!commentDraft.trim() || sending}
            className="flex h-11 items-center justify-center bg-[#ccff00] px-4 text-black transition hover:bg-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 divide-y divide-white/6">
          {detail.comments.length === 0 ? (
            <div className="py-6 text-sm text-white/40">还没人说话，来句「好看」也行。</div>
          ) : (
            detail.comments.map((entry) => (
              <CommentCard key={entry.id} comment={entry} />
            ))
          )}
        </div>
      </section>

      {sameSong.length > 0 ? (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h3
              className="text-[22px] font-black text-white"
              style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
            >
              同舞挑战
            </h3>
            <span className="text-[12px] text-white/40">同一支课的其他人</span>
          </div>
          <CommunityFeedGrid items={sameSong} />
        </section>
      ) : null}

      {toast ? (
        <div className="fixed bottom-8 left-1/2 z-[90] -translate-x-1/2 border border-[#ff0055]/40 bg-black/90 px-4 py-2.5 text-[13px] text-[#ff7ab0] shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function CommentCard({ comment }: { comment: CommunityComment }) {
  return (
    <div className="py-3.5">
      <div className="flex items-center gap-2">
        <Link href={`/u/${comment.username}`} className="text-[13px] font-semibold text-white/90 hover:text-[#ccff00]">
          {comment.displayName}
        </Link>
        {comment.isFeatured ? (
          <span className="bg-[#ccff00] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-black">精选</span>
        ) : null}
        <span className="font-mono text-[10px] text-white/30">{formatCommentTime(comment.createdAt)}</span>
      </div>
      <div
        className={`mt-1.5 leading-6 text-white/75 ${
          comment.content.length <= 6 ? "text-[15px]" : "text-[14px]"
        }`}
      >
        {comment.content}
      </div>
    </div>
  );
}
