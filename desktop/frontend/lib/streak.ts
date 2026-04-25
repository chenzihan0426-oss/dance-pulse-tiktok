/**
 * 连续学习 streak 的纯逻辑。抽出来方便 Date 注入做单测。
 */

import type { ActivityState } from "./m5-types";

/** 格式化为本地时区 YYYY-MM-DD。 */
export const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** 解析 YYYY-MM-DD 为本地时区 Date（时间归零）。非法格式返回 null。 */
export const fromLocalDateString = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
};

/** a 和 b 间隔的天数（正整数 or 0）。b 在 a 之后时返回正，之前返回负。 */
export const daysBetween = (aStr: string, bStr: string): number | null => {
  const a = fromLocalDateString(aStr);
  const b = fromLocalDateString(bStr);
  if (!a || !b) return null;
  const MS = 24 * 60 * 60 * 1000;
  // 用 UTC 消除夏令时影响
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUTC - aUTC) / MS);
};

/**
 * 根据上一次活跃状态和今天的日期，计算新的 ActivityState。纯函数。
 *
 * 规则：
 * - 同一天多次调用 → 不累加
 * - 刚好隔一天 → streak + 1
 * - 间隔 >= 2 天，或首次 → streak = 1
 * - 间隔为负（今天比 lastActiveDate 早，时钟倒拨等异常） → 保持不变，但更新 lastActiveDate 为今天
 */
export const computeNextActivity = (
  prev: ActivityState,
  todayStr: string
): ActivityState => {
  if (!prev.lastActiveDate) {
    return { lastActiveDate: todayStr, currentStreak: 1 };
  }
  const diff = daysBetween(prev.lastActiveDate, todayStr);
  if (diff === null) {
    // lastActiveDate 损坏，重置
    return { lastActiveDate: todayStr, currentStreak: 1 };
  }
  if (diff === 0) {
    // 同一天
    return { ...prev };
  }
  if (diff === 1) {
    return { lastActiveDate: todayStr, currentStreak: prev.currentStreak + 1 };
  }
  if (diff >= 2) {
    return { lastActiveDate: todayStr, currentStreak: 1 };
  }
  // diff < 0，时钟倒拨
  return { lastActiveDate: todayStr, currentStreak: prev.currentStreak };
};
