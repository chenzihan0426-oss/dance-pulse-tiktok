"use client";

import * as React from "react";
import { getDanceGroups, getDemoMedia, getLessons } from "@/lib/api";
import type { CommunityFeedItem } from "@/lib/types";
import { setBgmGroups } from "@/lib/communityShowcase";

let cachedThumbs: string[] | null = null;
let cachedVideos: string[] | null = null;
let cachedLessonIds: string[] | null = null;
let inflight: Promise<{ videos: string[]; thumbs: string[]; lessonIds: string[] }> | null = null;

function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 拉取并缓存本机 demo 媒体 + 真实课程 id；空结果不长期缓存，便于后端起来后重试 */
export async function loadDemoMedia(): Promise<{ videos: string[]; thumbs: string[]; lessonIds: string[] }> {
  if (cachedThumbs && cachedVideos && cachedLessonIds && (cachedThumbs.length > 0 || cachedVideos.length > 0)) {
    return { videos: cachedVideos, thumbs: cachedThumbs, lessonIds: cachedLessonIds };
  }
  if (!inflight) {
    inflight = Promise.all([
      getDemoMedia().catch(() => ({ videos: [], thumbs: [] })),
      getLessons().catch(() => []),
      getDanceGroups().then((g) => setBgmGroups(g)).catch(() => undefined),
    ])
      .then(([data, lessons]) => {
        const videos = data.videos ?? [];
        const thumbs = data.thumbs ?? [];
        const lessonIds = lessons.map((l) => l.id);
        if (videos.length || thumbs.length) {
          cachedVideos = videos;
          cachedThumbs = thumbs;
          cachedLessonIds = lessonIds;
        }
        return { videos, thumbs, lessonIds };
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

/**
 * 演示作品的严格对齐:只保留"自身视频文件真实存在于本机"的作品,
 * 视频一律用作品自己的 videoUrl(不跨作品轮换),封面取该视频的抽帧图。
 * 传入 lessonIds 时额外要求作品挂的课程真实存在(查看详情/跟跳这支
 * 都能真实跳转)。视频不存在的假推荐直接过滤掉——宁缺毋滥。
 * videos 池为空(后端未就绪)时不过滤,退化为只轮换封面。
 */
export function alignFeedMedia(
  items: CommunityFeedItem[],
  thumbs: string[],
  videos: string[],
  lessonIds?: string[]
): CommunityFeedItem[] {
  if (!videos.length) return rotateFeedThumbs(items, thumbs);
  const videoTails = new Set(videos.map((v) => v.split("/").pop() ?? v));
  const lessonSet = lessonIds && lessonIds.length ? new Set(lessonIds) : null;
  return items
    .filter((item) => {
      const tail = item.result.videoUrl?.split("?")[0].split("/").pop();
      if (!tail || !videoTails.has(tail)) return false;
      // 课程也必须真实存在,否则详情页"查看详情/跟跳这支"会 404
      if (lessonSet && !lessonSet.has(item.result.lessonId)) return false;
      return true;
    })
    .map((item, index) => {
      const key = item.result.id || `${item.user.username}-${index}`;
      const paired = thumbsForVideo(item.result.videoUrl, thumbs);
      const thumb = paired.length
        ? paired[hashKey(key) % paired.length]
        : item.previewThumbnail;
      return {
        ...item,
        previewThumbnail: thumb ?? item.previewThumbnail,
        result: { ...item.result },
        user: { ...item.user, stats: { ...item.user.stats } },
      };
    });
}

export function clearDemoMediaCache() {
  cachedThumbs = null;
  cachedVideos = null;
}

/** 各展示页统一用：封面池 + 视频池 + 真实课程 id + 是否已加载 */
export function useDemoCoverPool() {
  const [thumbs, setThumbs] = React.useState<string[]>(cachedThumbs ?? []);
  const [videos, setVideos] = React.useState<string[]>(cachedVideos ?? []);
  const [lessonIds, setLessonIds] = React.useState<string[]>(cachedLessonIds ?? []);
  const [ready, setReady] = React.useState(Boolean(cachedThumbs?.length));

  React.useEffect(() => {
    let cancelled = false;
    void loadDemoMedia().then((demo) => {
      if (cancelled) return;
      setThumbs(demo.thumbs);
      setVideos(demo.videos);
      setLessonIds(demo.lessonIds);
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

  return { thumbs, videos, lessonIds, ready, coverFor };
}
