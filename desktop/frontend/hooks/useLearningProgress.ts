"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROGRESS_UPDATED_EVENT,
  getLearnedIds,
  setLearnedIds,
  clearLearnedIds,
  getActivity,
  setActivity,
} from "../lib/storage";
import { computeNextActivity, toLocalDateString } from "../lib/streak";
import { requestLocalSnapshotSync } from "../lib/api";

export type UseLearningProgressReturn = {
  /** 当前 lesson 已学会的 segment id（去重，按写入顺序）。 */
  learnedIds: string[];
  /** 已学会数量。 */
  learnedCount: number;
  /** 当前 lesson segment 总数。由页面通过 setTotal 提供。 */
  total: number;
  /** 设置总数。通常在 M3 详情页加载 lesson 后调用一次。 */
  setTotal: (n: number) => void;
  /** 进度 0~1 浮点。total=0 时为 0。 */
  progress: number;
  /** 进度百分比整数 0~100。 */
  percent: number;
  /** 标记学会。幂等；首次新增会记录活跃天。 */
  markLearned: (id: string) => void;
  /** 取消学会。不存在也不报错。 */
  unmark: (id: string) => void;
  /** 切换学会状态。 */
  toggleLearned: (id: string) => void;
  /** 是否学会。 */
  isLearned: (id: string) => boolean;
  /** 清空当前 lesson 的学习状态。 */
  resetLesson: () => void;
};

/**
 * 当前 lesson 的学习进度。
 *
 * 存储：dp:learned:{lessonId} = string[]
 * total 不进 storage，是页面运行时上下文。
 *
 * SSR 兼容：首屏 learnedIds=[]，useEffect 在客户端 hydrate 时从 storage 恢复。
 */
export const useLearningProgress = (
  lessonId: string
): UseLearningProgressReturn => {
  const [learnedIds, setLearnedIdsState] = useState<string[]>([]);
  const [total, setTotalState] = useState<number>(0);

  // hydrate：lessonId 变化时重新读
  useEffect(() => {
    if (!lessonId) {
      setLearnedIdsState([]);
      return;
    }
    setLearnedIdsState(getLearnedIds(lessonId));

    const sync = () => setLearnedIdsState(getLearnedIds(lessonId));
    const onProgressUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ lessonId?: string }>).detail;
      if (!detail?.lessonId || detail.lessonId === lessonId) {
        sync();
      }
    };

    window.addEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated as EventListener);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.removeEventListener(PROGRESS_UPDATED_EVENT, onProgressUpdated as EventListener);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [lessonId]);

  const persist = useCallback(
    (next: string[]) => {
      setLearnedIds(lessonId, next);
      setLearnedIdsState(next);
    },
    [lessonId]
  );

  const markLearned = useCallback(
    (id: string) => {
      if (!id || !lessonId) return;
      // 读最新持久化，避免过时 state 覆盖
      const current = getLearnedIds(lessonId);
      if (current.includes(id)) {
        // 幂等：已存在则仅同步到内存 state（防御 state 和 storage 不一致）
        setLearnedIdsState(current);
        return;
      }
      const next = [...current, id];
      persist(next);
      // 真正新增时记一次活跃
      const today = toLocalDateString(new Date());
      const prevActivity = getActivity();
      const nextActivity = computeNextActivity(prevActivity, today);
      setActivity(nextActivity);
      requestLocalSnapshotSync();
    },
    [lessonId, persist]
  );

  const unmark = useCallback(
    (id: string) => {
      if (!id || !lessonId) return;
      const current = getLearnedIds(lessonId);
      if (!current.includes(id)) {
        setLearnedIdsState(current);
        return;
      }
      persist(current.filter((x) => x !== id));
      requestLocalSnapshotSync();
    },
    [lessonId, persist]
  );

  const toggleLearned = useCallback(
    (id: string) => {
      if (!id || !lessonId) return;
      const current = getLearnedIds(lessonId);
      if (current.includes(id)) {
        persist(current.filter((x) => x !== id));
        requestLocalSnapshotSync();
      } else {
        const next = [...current, id];
        persist(next);
        const today = toLocalDateString(new Date());
        const prevActivity = getActivity();
        const nextActivity = computeNextActivity(prevActivity, today);
        setActivity(nextActivity);
        requestLocalSnapshotSync();
      }
    },
    [lessonId, persist]
  );

  const isLearned = useCallback(
    (id: string) => learnedIds.includes(id),
    [learnedIds]
  );

  const resetLesson = useCallback(() => {
    if (!lessonId) return;
    clearLearnedIds(lessonId);
    setLearnedIdsState([]);
    requestLocalSnapshotSync();
  }, [lessonId]);

  const setTotal = useCallback((n: number) => {
    const v = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    setTotalState(v);
  }, []);

  const { progress, percent } = useMemo(() => {
    if (total <= 0) return { progress: 0, percent: 0 };
    const p = Math.min(1, learnedIds.length / total);
    return { progress: p, percent: Math.round(p * 100) };
  }, [learnedIds.length, total]);

  return useMemo(
    () => ({
      learnedIds,
      learnedCount: learnedIds.length,
      total,
      setTotal,
      progress,
      percent,
      markLearned,
      unmark,
      toggleLearned,
      isLearned,
      resetLesson,
    }),
    [
      learnedIds,
      total,
      setTotal,
      progress,
      percent,
      markLearned,
      unmark,
      toggleLearned,
      isLearned,
      resetLesson,
    ]
  );
};
