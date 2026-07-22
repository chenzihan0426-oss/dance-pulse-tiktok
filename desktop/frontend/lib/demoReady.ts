// 判定 lesson 是否可进入跟拍挑战。
// 最低要求：可练段有 clip + 姿态（pose_full 优先，普通 pose 亦可）。
// matte / particle 为视觉增强，缺省时跟拍页自动降级为骨架比对，不再阻塞入口。

import type { Lesson, Segment } from "./types";

export function segmentHasChallengePose(seg: Segment): boolean {
  return !!(seg.pose_full_url || seg.pose_url);
}

export function segmentIsReady(seg: Segment): boolean {
  return !!(seg.clip_url && segmentHasChallengePose(seg));
}

/** 完整特效管线是否齐备（抠像 + 粒子 + pose_full）；仅作展示提示，不挡挑战。 */
export function segmentIsFxReady(seg: Segment): boolean {
  return !!(seg.matte_rgb_url && seg.matte_mask_url && seg.particle_url && seg.pose_full_url);
}

export function lessonIsDemoReady(lesson: Pick<Lesson, "segments">): boolean {
  // 与 allLearned / practiceSegments 口径一致：排除静止段(is_still)
  const segs = lesson.segments.filter((s) => !s.deleted && !s.is_still);
  if (!segs.length) return false;
  return segs.every(segmentIsReady);
}
