/**
 * 徽章定义与解锁判断（纯函数）。
 *
 * 所有解锁规则都是无副作用的纯函数，方便单测。副作用（写 localStorage）由 useBadges hook 负责。
 */

import type {
  BadgeDefinition,
  BadgeId,
  BadgeCheckInput,
  SegmentLike,
} from "./m5-types";
import { BADGE_IDS } from "./m5-types";

// ---------- 元数据 ----------

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  first_learned: {
    id: "first_learned",
    title: "起步",
    description: "学会第一个动作",
    icon: "sparkles",
    color: "#F59E0B",
  },
  half_done: {
    id: "half_done",
    title: "过半",
    description: "当前课程学完一半",
    icon: "trending-up",
    color: "#3B82F6",
  },
  lesson_complete: {
    id: "lesson_complete",
    title: "通关",
    description: "当前课程全部学会",
    icon: "check-circle",
    color: "#10B981",
  },
  chorus_master: {
    id: "chorus_master",
    title: "副歌主宰",
    description: "学会一首歌全部副歌动作",
    icon: "crown",
    color: "#E85D24",
  },
  three_day_streak: {
    id: "three_day_streak",
    title: "三日连击",
    description: "连续学习三天",
    icon: "flame",
    color: "#EF4444",
  },
  kpop_expert: {
    id: "kpop_expert",
    title: "K-pop 达人",
    description: "累计学会 50 个动作",
    icon: "star",
    color: "#8B5CF6",
  },
};

export const getBadgeDefinition = (id: BadgeId): BadgeDefinition =>
  BADGE_DEFINITIONS[id];

export const getAllBadgeDefinitions = (): BadgeDefinition[] =>
  BADGE_IDS.map((id) => BADGE_DEFINITIONS[id]);

// ---------- 判断工具 ----------

/** 某个 segment 是否属于 chorus（副歌）。section 或 section_label 命中即可。 */
export const isChorusSegment = (seg: SegmentLike): boolean => {
  const fields = [seg.section, seg.section_label];
  for (const f of fields) {
    if (typeof f !== "string") continue;
    const lower = f.toLowerCase();
    if (lower.includes("chorus")) return true;
    if (f.includes("副歌")) return true;
  }
  return false;
};

// ---------- 解锁判断：每条规则都是独立纯函数 ----------

/** first_learned：任意学会过一个。 */
export const checkFirstLearned = (input: BadgeCheckInput): boolean =>
  input.learnedIds.length >= 1;

/** half_done：当前 lesson 学会数 >= ceil(total / 2) 且 total > 0。 */
export const checkHalfDone = (input: BadgeCheckInput): boolean => {
  if (input.total <= 0) return false;
  const threshold = Math.ceil(input.total / 2);
  return input.learnedIds.length >= threshold;
};

/** lesson_complete：当前 lesson 全部学会。 */
export const checkLessonComplete = (input: BadgeCheckInput): boolean => {
  if (input.total <= 0) return false;
  return input.learnedIds.length >= input.total;
};

/**
 * chorus_master：当前 lesson 里所有 chorus segment 都已学会。
 * 如果当前 lesson 没有 chorus segment，不解锁。
 */
export const checkChorusMaster = (input: BadgeCheckInput): boolean => {
  const segs = input.segments;
  if (!segs || segs.length === 0) return false;
  const chorusSegs = segs.filter(isChorusSegment);
  if (chorusSegs.length === 0) return false;
  const learnedSet = new Set(input.learnedIds);
  return chorusSegs.every((s) => learnedSet.has(s.id));
};

/** three_day_streak：当前连续天数 >= 3。 */
export const checkThreeDayStreak = (input: BadgeCheckInput): boolean => {
  return (input.currentStreak ?? 0) >= 3;
};

/**
 * kpop_expert：全局累计唯一 segment 数 >= 50。
 * 该规则需要跨 lesson 聚合，由调用方（useBadges hook）先从 storage 读出全局计数再传入。
 * 为了保持纯函数，把全局计数作为一个可选字段挂在 input 上。
 */
export const checkKpopExpert = (
  input: BadgeCheckInput & { globalLearnedCount?: number }
): boolean => {
  return (input.globalLearnedCount ?? 0) >= 50;
};

// ---------- 聚合 ----------

/**
 * 根据当前输入，返回所有应该已经解锁的徽章 id。
 * 注意：这只是"该解锁的集合"，不含"新解锁"语义。新解锁由 hook 层做 diff。
 */
export const evaluateBadges = (
  input: BadgeCheckInput & { globalLearnedCount?: number }
): BadgeId[] => {
  const result: BadgeId[] = [];
  if (checkFirstLearned(input)) result.push("first_learned");
  if (checkHalfDone(input)) result.push("half_done");
  if (checkLessonComplete(input)) result.push("lesson_complete");
  if (checkChorusMaster(input)) result.push("chorus_master");
  if (checkThreeDayStreak(input)) result.push("three_day_streak");
  if (checkKpopExpert(input)) result.push("kpop_expert");
  return result;
};

/**
 * 给定之前已解锁集合和本次 evaluate 结果，返回"本次新解锁"的 id 数组，
 * 以及合并后的完整解锁集合。幂等。
 */
export const diffBadges = (
  previouslyUnlocked: BadgeId[],
  shouldBeUnlocked: BadgeId[]
): { newlyUnlocked: BadgeId[]; merged: BadgeId[] } => {
  const prevSet = new Set(previouslyUnlocked);
  const newlyUnlocked: BadgeId[] = [];
  for (const id of shouldBeUnlocked) {
    if (!prevSet.has(id)) newlyUnlocked.push(id);
  }
  const merged = Array.from(new Set([...previouslyUnlocked, ...shouldBeUnlocked]));
  return { newlyUnlocked, merged };
};
