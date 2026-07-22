"use client";

import * as React from "react";
import { getDemoMedia } from "@/lib/api";
import type { CommunityFeedItem } from "@/lib/types";

let cachedThumbs: string[] | null = null;
let cachedVideos: string[] | null = null;
let inflight: Promise<{ videos: string[]; thumbs: string[] }> | null = null;

function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 拉取并缓存本机 demo 媒体；空结果不长期缓存，便于后端起来后重试 */
export async function loadDemoMedia(): Promise<{ videos: string[]; thumbs: string[] }> {
  if (cachedThumbs && cachedVideos && (cachedThumbs.length > 0 || cachedVideos.length > 0)) {
    return { videos: cachedVideos, thumbs: cachedThumbs };
  }
  if (!inflight) {
    inflight = getDemoMedia()
      .then((data) => {
        const videos = data.videos ?? [];
        const thumbs = data.thumbs ?? [];
        if (videos.length || thumbs.length) {
          cachedVideos = videos;
          cachedThumbs = thumbs;
        }
        return { videos, thumbs };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 按稳定 key 从封面池取图，同 id 始终同图、不同 id 尽量打散 */
export function pickDemoThumb(key: string, thumbs: string[], fallback?: string | null): string | null {
  if (!thumbs.length) return fallback ?? null;
  return thumbs[hashKey(key) % thumbs.length];
}

/** 按稳定 key 从视频池取视频(与 pickDemoThumb 同 key 同 hash,保证一致) */
export function pickDemoVideo(key: string, videos: string[], fallback?: string | null): string | null {
  if (!videos.length) return fallback ?? null;
  return videos[hashKey(key) % videos.length];
}

/** 视频路径 -> 它的抽帧封面(后端按 {stem}_fXX.jpg 约定生成);没有就退给任意池图 */
function thumbsForVideo(videoUrl: string, thumbs: string[]): string[] {
  const stem = videoUrl.split("/").pop()?.replace(/\.[^.]+$/, "");
  if (!stem) return [];
  return thumbs.filter((t) => {
    const name = t.split("/").pop() ?? "";
    return name.startsWith(`${stem}_f`) || name === `${stem}.jpg`;
  });
}

/** 用磁盘封面打散 feed，避免假推荐全是同一张课图 */
export function rotateFeedThumbs(
  items: CommunityFeedItem[],
  thumbs: string[]
): CommunityFeedItem[] {
  return rotateFeedMedia(items, thumbs, []);
}

/**
 * 封面 + 视频一起轮换,并保证两者对应:
 * 先按 key 选视频,封面优先从该视频的抽帧图({stem}_fXX.jpg)里选,
 * 点开详情播的就是封面对应的那支视频,不会"图文不符"。
 */
export function rotateFeedMedia(
  items: CommunityFeedItem[],
  thumbs: string[],
  videos: string[]
): CommunityFeedItem[] {
  if (!thumbs.length && !videos.length) return items;
  return items.map((item, index) => {
    const key = item.result.id || `${item.user.username}-${index}`;
    const video = pickDemoVideo(key, videos, item.result.videoUrl);
    // 封面优先取所选视频自己的抽帧图;该视频没有抽帧图时退回全池哈希图
    const paired = video ? thumbsForVideo(video, thumbs) : [];
    const thumb = paired.length
      ? paired[hashKey(key) % paired.length]
      : pickDemoThumb(key, thumbs, item.previewThumbnail);
    return {
      ...item,
      previewThumbnail: thumb ?? item.previewThumbnail,
      result: { ...item.result, videoUrl: video ?? item.result.videoUrl },
      user: { ...item.user, stats: { ...item.user.stats } },
    };
  });
}

export function clearDemoMediaCache() {
  cachedThumbs = null;
  cachedVideos = null;
}

/** 各展示页统一用：封面池 + 是否已加载 */
export function useDemoCoverPool() {
  const [thumbs, setThumbs] = React.useState<string[]>(cachedThumbs ?? []);
  const [ready, setReady] = React.useState(Boolean(cachedThumbs?.length));

  React.useEffect(() => {
    let cancelled = false;
    void loadDemoMedia().then((demo) => {
      if (cancelled) return;
      setThumbs(demo.thumbs);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const coverFor = React.useCallback(
    (key: string, fallback?: string | null) => pickDemoThumb(key, thumbs, fallback),
    [thumbs]
  );

  return { thumbs, ready, coverFor };
}
