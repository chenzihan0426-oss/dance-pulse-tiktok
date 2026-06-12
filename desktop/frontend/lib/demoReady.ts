// 判定 lesson 是否已完整预处理, 可进入跟拍挑战
// (所有非删除 segment 都要有 matte_rgb + matte_mask + particle + pose_full)

import type { Lesson, Segment } from "./types";

export function segmentIsReady(seg: Segment): boolean {
  return !!(seg.matte_rgb_url && seg.matte_mask_url && seg.particle_url && seg.pose_full_url);
}

export function lessonIsDemoReady(lesson: Pick<Lesson, "segments">): boolean {
  // 与 allLearned / practiceSegments 口径一致：排除静止段(is_still)
  const segs = lesson.segments.filter((s) => !s.deleted && !s.is_still);
  if (!segs.length) return false;
  return segs.every(segmentIsReady);
}
