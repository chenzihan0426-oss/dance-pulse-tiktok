"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Heart, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addCommunityComment,
  deleteCommunityTrackingResult,
  getCommunityTrackingDetail,
  toggleCommunityFollow,
  toggleCommunityLike,
  unpublishTrackingResult,
} from "@/lib/api";
import type { CommunityComment, CommunityTrackingDetailResponse } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

export default function CommunityResultDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resultId = params?.id ?? "";
  const { user } = useAuth();
  const [detail, setDetail] = React.useState<CommunityTrackingDetailResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void getCommunityTrackingDetail(resultId)
      .then((response) => {
        if (!cancelled) {
          setDetail(response);
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
  }, [resultId]);

  async function handleLike() {
    if (!detail) return;
    const next = await toggleCommunityLike(detail.item.result.id);
    setDetail((current) =>
      current
        ? {
            ...current,
            item: {
              ...current.item,
              likedByMe: next.liked,
              result: { ...current.item.result, likeCount: next.likeCount },
            },
          }
        : current
    );
  }

  async function handleFollow() {
    if (!detail) return;
    const next = await toggleCommunityFollow(detail.item.user.username);
    setDetail((current) =>
      current
        ? {
            ...current,
            item: {
              ...current.item,
              user: {
                ...current.item.user,
                isFollowing: next.following,
                stats: {
                  ...current.item.user.stats,
                  followerCount: next.followerCount,
                },
              },
            },
          }
        : current
    );
  }

  async function handleComment() {
    if (!detail || !commentDraft.trim()) return;
    setSending(true);
    try {
      const comments = await addCommunityComment(detail.item.result.id, commentDraft);
      setDetail((current) =>
        current
          ? {
              ...current,
              comments,
              item: {
                ...current.item,
                result: {
                  ...current.item.result,
                  commentCount: comments.length,
                },
              },
            }
          : current
      );
      setCommentDraft("");
    } finally {
      setSending(false);
    }
  }

  async function handleUnpublish() {
    if (!detail) return;
    const next = await unpublishTrackingResult(detail.item.result.id);
    router.push(`/lesson/${next.lessonId}/tracking`);
  }

  async function handleDelete() {
    if (!detail) return;
    await deleteCommunityTrackingResult(detail.item.result.id);
    router.push("/community");
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-[960px] px-10 py-12 text-white">
        <div className="flex h-48 items-center justify-center rounded-[28px] bg-bg-surface text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="mx-auto min-h-screen max-w-[960px] px-10 py-12 text-white">
        <div className="rounded-[24px] border border-state-danger/20 bg-state-danger/10 px-4 py-5 text-sm text-red-200">
          {error ?? "作品加载失败"}
        </div>
      </main>
    );
  }

  const isOwnProfile = user?.username === detail.item.user.username;

  return (
    <main className="mx-auto min-h-screen max-w-[960px] px-5 pb-10 pt-8 text-white">
      <Link
        href="/community"
        className="inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回社区
      </Link>

      <section className="mt-6 overflow-hidden rounded-[30px] border border-white/8 bg-bg-raised">
        <div className="aspect-[9/16] bg-black">
          <video
            src={detail.item.result.videoUrl}
            poster={detail.item.previewThumbnail ?? undefined}
            className="h-full w-full object-contain"
            controls
            playsInline
          />
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={`/u/${detail.item.user.username}`} className="text-[18px] font-semibold text-white">
                {detail.item.user.displayName}
              </Link>
              <div className="mt-1 text-[13px] text-white/45">@{detail.item.user.username}</div>
              <div className="mt-2 text-[13px] text-white/45">{detail.item.lessonTitle}</div>
            </div>

            {!isOwnProfile ? (
              <Button
                variant={detail.item.user.isFollowing ? "secondary" : "primary"}
                onClick={handleFollow}
                className="rounded-[16px]"
              >
                {detail.item.user.isFollowing ? "已关注" : "关注"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.item.result.isPublic ? (
                  <Button variant="secondary" onClick={handleUnpublish} className="rounded-[16px]">
                    取消公开
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  className="rounded-[16px] text-red-200 hover:text-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[20px] bg-white/[0.04] px-4 py-4">
              <div className="text-[12px] text-white/45">总分</div>
              <div className="mt-3 text-[32px] font-semibold text-white">{detail.item.result.score}</div>
            </div>
            <button
              type="button"
              onClick={handleLike}
              className="rounded-[20px] bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.07]"
            >
              <div className="inline-flex items-center gap-1 text-[12px] text-white/45">
                <Heart className="h-3.5 w-3.5" />
                喜欢
              </div>
              <div className="mt-3 text-[32px] font-semibold text-white">{detail.item.result.likeCount}</div>
            </button>
            <div className="rounded-[20px] bg-white/[0.04] px-4 py-4">
              <div className="inline-flex items-center gap-1 text-[12px] text-white/45">
                <MessageCircle className="h-3.5 w-3.5" />
                评论
              </div>
              <div className="mt-3 text-[32px] font-semibold text-white">{detail.item.result.commentCount}</div>
            </div>
          </div>

          <div className="space-y-3">
            {detail.item.result.segmentScores.slice(0, 6).map((item) => (
              <div key={item.segmentId} className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px] font-medium text-white">{item.segmentId}</div>
                  <div className="text-[18px] font-semibold text-white">{item.score}</div>
                </div>
                <div className="mt-2 text-[12px] text-white/45">时序偏差约 {item.timingMs}ms</div>
                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/8 bg-bg-surface px-5 py-5">
        <div className="text-[18px] font-semibold text-white">评论区</div>

        <div className="mt-4 flex gap-3">
          <input
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="写点你的看法…"
            className="h-11 flex-1 rounded-[16px] border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/25"
          />
          <Button onClick={handleComment} disabled={!commentDraft.trim() || sending} className="h-11 rounded-[16px] px-4">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {detail.comments.length === 0 ? (
            <div className="rounded-[18px] bg-black/18 px-4 py-4 text-sm text-white/45">
              还没有评论，来留下第一条反馈吧。
            </div>
          ) : (
            detail.comments.map((comment) => <CommentCard key={comment.id} comment={comment} />)
          )}
        </div>
      </section>
    </main>
  );
}

function CommentCard({ comment }: { comment: CommunityComment }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/u/${comment.username}`} className="text-[14px] font-medium text-white">
          {comment.displayName}
        </Link>
        <div className="text-[12px] text-white/35">
          {new Date(comment.createdAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div className="mt-2 text-[14px] leading-6 text-white/72">{comment.content}</div>
    </div>
  );
}
