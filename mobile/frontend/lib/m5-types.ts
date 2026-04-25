/**
 * M5 游戏化模块专用类型。
 *
 * 这些类型只给 M5 自己用，不进公共 types.ts，避免和 M3 / M4 的共享 Lesson / Segment 定义冲突。
 * 合并进主仓库时这个文件直接原样放进 frontend/lib/m5-types.ts 即可，无需 merge。
 *
 * 如果未来项目公共 types.ts 已经有 Segment，SegmentLike 是它的结构子集，
 * 公共 Segment 可以安全地当作 SegmentLike 传入 M5 的 API。
 */

/** M5 需要的 Segment 最小形态。公共 Segment 应当满足此接口。 */
export type SegmentLike = {
  id: string;
  lesson_id?: string;
  section?: string;
  section_label?: string;
  is_still?: boolean;
};

/** 徽章 id 常量集合。 */
export const BADGE_IDS = [
  "first_learned",
  "half_done",
  "lesson_complete",
  "chorus_master",
  "three_day_streak",
  "kpop_expert",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

/** 徽章定义元数据。 */
export type BadgeDefinition = {
  id: BadgeId;
  title: string;
  description: string;
  /** 可选的图标名（留给 UI 层，如 lucide 图标名）。 */
  icon?: string;
  /** 可选的主题色（留给 UI 层）。 */
  color?: string;
};

/** 学习活跃状态（streak）。 */
export type ActivityState = {
  /** 最近一次学习活跃日期，YYYY-MM-DD，首次前为 null。 */
  lastActiveDate: string | null;
  /** 当前连续天数。 */
  currentStreak: number;
};

/** 徽章解锁判断的输入。 */
export type BadgeCheckInput = {
  lessonId: string;
  learnedIds: string[];
  total: number;
  segments?: SegmentLike[];
  currentStreak?: number;
};

/** localStorage key 命名约定。集中在此便于维护和测试。 */
export const STORAGE_KEYS = {
  /** 某个 lesson 的已学会 segment id 数组。 */
  learnedPrefix: "dp:learned:",
  /** 全局已解锁徽章 id 数组。 */
  badges: "dp:badges",
  /** 全局学习活跃状态。 */
  activity: "dp:activity",
} as const;

export const learnedKey = (lessonId: string): string =>
  `${STORAGE_KEYS.learnedPrefix}${lessonId}`;
