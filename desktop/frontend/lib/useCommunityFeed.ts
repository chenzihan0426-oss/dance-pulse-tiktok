"use client";

import * as React from "react";
import {
  getCommunityFeed,
  getCommunityTrackingDetail,
  getCommunityUserProfile,
  toggleCommunityFollow,
  toggleCommunityLike,
  addCommunityComment,
} from "@/lib/api";
import { loadDemoMedia, alignFeedMedia, rotateFeedThumbs } from "@/lib/demoMedia";
import {
  forceCommunityShowcase,
  getShowcaseDetail,
  getShowcaseFeedSorted,
  getShowcaseUserProfile,
  isShowcaseResultId,
  isShowcaseUsername,
  type PlazaFilter,
} from "@/lib/communityShowcase";
import type {
  CommunityComment,
  CommunityFeedItem,
  CommunityTrackingDetailResponse,
  CommunityUserProfileResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
} from "@/lib/types";

export type FeedSource = "api" | "showcase";

export function useCommunityFeed(filter: PlazaFilter = "hot") {
  const [items, setItems] = React.useState<CommunityFeedItem[]>([]);
  const [source, setSource] = React.useState<FeedSource>("showcase");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const demo = await loadDemoMedia();

      if (forceCommunityShowcase()) {
        if (!cancelled) {
          setItems(alignFeedMedia(getShowcaseFeedSorted(filter), demo.thumbs, demo.videos));
          setSource("showcase");
          setLoading(false);
        }
        return;
      }

      try {
        const feed = await getCommunityFeed();
        if (cancelled) return;
        if (!feed.length) {
          setItems(alignFeedMedia(getShowcaseFeedSorted(filter), demo.thumbs, demo.videos));
          setSource("showcase");
        } else {
          // 真实 API 作品有自己的视频,只轮换缺失的封面,不动 videoUrl
          setItems(rotateFeedThumbs(feed, demo.thumbs.length ? demo.thumbs : []));
          setSource("api");
        }
      } catch (err) {
        if (cancelled) return;
        setItems(alignFeedMedia(getShowcaseFeedSorted(filter), demo.thumbs, demo.videos));
        setSource("showcase");
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return { items, source, loading, error };
}

export function useCommunityDetail(resultId: string) {
  const [detail, setDetail] = React.useState<CommunityTrackingDetailResponse | null>(null);
  const [source, setSource] = React.useState<FeedSource>("showcase");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const demo = await loadDemoMedia();

      if (isShowcaseResultId(resultId) || forceCommunityShowcase()) {
        const local = getShowcaseDetail(resultId);
        if (!cancelled) {
          if (!local) {
            setError("作品不存在");
            setDetail(null);
          } else {
            // alignFeedMedia:视频不存在的作品会被过滤成空 → 视为不存在;
            // 存在的用作品自身视频 + 其抽帧封面,与列表卡片一致
            const [rotated] = alignFeedMedia([local.item], demo.thumbs, demo.videos);
            if (rotated) {
              setDetail({ ...local, item: rotated });
            } else {
              setError("作品不存在");
              setDetail(null);
            }
          }
          setSource("showcase");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await getCommunityTrackingDetail(resultId);
        if (cancelled) return;
        const [rotated] = rotateFeedThumbs([response.item], demo.thumbs);
        setDetail({ ...response, item: rotated ?? response.item });
        setSource("api");
      } catch (err) {
        const local = getShowcaseDetail(resultId);
        if (cancelled) return;
        if (local) {
          const [rotated] = alignFeedMedia([local.item], demo.thumbs, demo.videos);
          setDetail({ ...local, item: rotated ?? local.item });
          setSource("showcase");
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  async function like(): Promise<ToggleLikeResponse | null> {
    if (!detail) return null;
    if (source === "showcase") {
      const nextLiked = !detail.item.likedByMe;
      const nextCount = detail.item.result.likeCount + (nextLiked ? 1 : -1);
      setDetail({
        ...detail,
        item: {
          ...detail.item,
          likedByMe: nextLiked,
          result: { ...detail.item.result, likeCount: Math.max(0, nextCount) },
        },
      });
      return { liked: nextLiked, likeCount: Math.max(0, nextCount) };
    }
    const next = await toggleCommunityLike(detail.item.result.id);
    setDetail({
      ...detail,
      item: {
        ...detail.item,
        likedByMe: next.liked,
        result: { ...detail.item.result, likeCount: next.likeCount },
      },
    });
    return next;
  }

  async function follow(): Promise<ToggleFollowResponse | null> {
    if (!detail) return null;
    if (source === "showcase") {
      const nextFollowing = !detail.item.user.isFollowing;
      const nextCount = detail.item.user.stats.followerCount + (nextFollowing ? 1 : -1);
      setDetail({
        ...detail,
        item: {
          ...detail.item,
          user: {
            ...detail.item.user,
            isFollowing: nextFollowing,
            stats: {
              ...detail.item.user.stats,
              followerCount: Math.max(0, nextCount),
            },
          },
        },
      });
      return { following: nextFollowing, followerCount: Math.max(0, nextCount) };
    }
    const next = await toggleCommunityFollow(detail.item.user.username);
    setDetail({
      ...detail,
      item: {
        ...detail.item,
        user: {
          ...detail.item.user,
          isFollowing: next.following,
          stats: { ...detail.item.user.stats, followerCount: next.followerCount },
        },
      },
    });
    return next;
  }

  async function comment(content: string): Promise<void> {
    if (!detail || !content.trim()) return;
    if (source === "showcase") {
      const entry: CommunityComment = {
        id: `sc_local_${Date.now()}`,
        trackingResultId: detail.item.result.id,
        userId: "guest_local",
        username: "local_guest",
        displayName: "本机访客",
        avatar: null,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      setDetail({
        ...detail,
        comments: [entry, ...detail.comments],
        item: {
          ...detail.item,
          result: {
            ...detail.item.result,
            commentCount: detail.item.result.commentCount + 1,
          },
        },
      });
      return;
    }
    const comments = await addCommunityComment(detail.item.result.id, content.trim());
    setDetail({
      ...detail,
      comments,
      item: {
        ...detail.item,
        result: { ...detail.item.result, commentCount: comments.length },
      },
    });
  }

  return { detail, source, loading, error, like, follow, comment, setDetail };
}

export function useCommunityProfile(username: string) {
  const [data, setData] = React.useState<CommunityUserProfileResponse | null>(null);
  const [source, setSource] = React.useState<FeedSource>("showcase");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      if (isShowcaseUsername(username) || forceCommunityShowcase()) {
        const local = getShowcaseUserProfile(username);
        if (!cancelled) {
          if (!local) setError("用户不存在");
          setData(local);
          setSource("showcase");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await getCommunityUserProfile(username);
        if (cancelled) return;
        setData(response);
        setSource("api");
      } catch (err) {
        const local = getShowcaseUserProfile(username);
        if (cancelled) return;
        if (local) {
          setData(local);
          setSource("showcase");
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  async function follow(): Promise<void> {
    if (!data) return;
    if (source === "showcase") {
      const nextFollowing = !data.user.isFollowing;
      const nextCount = data.user.stats.followerCount + (nextFollowing ? 1 : -1);
      setData({
        ...data,
        user: {
          ...data.user,
          isFollowing: nextFollowing,
          stats: { ...data.user.stats, followerCount: Math.max(0, nextCount) },
        },
      });
      return;
    }
    const next = await toggleCommunityFollow(data.user.username);
    setData({
      ...data,
      user: {
        ...data.user,
        isFollowing: next.following,
        stats: { ...data.user.stats, followerCount: next.followerCount },
      },
    });
  }

  return { data, source, loading, error, follow };
}
