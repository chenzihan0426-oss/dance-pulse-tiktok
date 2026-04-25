"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityState } from "../lib/m5-types";
import { getActivity, setActivity } from "../lib/storage";
import { computeNextActivity, toLocalDateString } from "../lib/streak";
import { requestLocalSnapshotSync } from "../lib/api";

export type UseLearningStreakReturn = {
  currentStreak: number;
  lastActiveDate: string | null;
  /** 记录今天的一次学习活跃。同日幂等。 */
  recordActivity: () => void;
};

const INITIAL: ActivityState = { lastActiveDate: null, currentStreak: 0 };

/**
 * 连续学习天数。
 *
 * SSR 兼容：首屏 state 为 INITIAL，useEffect 在客户端挂载后再从 storage 恢复。
 */
export const useLearningStreak = (): UseLearningStreakReturn => {
  const [state, setState] = useState<ActivityState>(INITIAL);

  useEffect(() => {
    setState(getActivity());
  }, []);

  const recordActivity = useCallback(() => {
    const today = toLocalDateString(new Date());
    setState((prev) => {
      // 读最新持久化（防止并发多 hook 实例互相覆盖）
      const actual = getActivity();
      const base = actual.lastActiveDate || prev.lastActiveDate
        ? actual
        : prev;
      const next = computeNextActivity(base, today);
      setActivity(next);
      requestLocalSnapshotSync();
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      currentStreak: state.currentStreak,
      lastActiveDate: state.lastActiveDate,
      recordActivity,
    }),
    [recordActivity, state.currentStreak, state.lastActiveDate]
  );
};
