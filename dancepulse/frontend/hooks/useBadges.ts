"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BadgeCheckInput,
  BadgeDefinition,
  BadgeId,
} from "../lib/m5-types";
import {
  getUnlockedBadges,
  setUnlockedBadges,
  getGlobalLearnedCount,
  rawRemove,
} from "../lib/storage";
import { requestLocalSnapshotSync } from "../lib/api";
import { STORAGE_KEYS } from "../lib/m5-types";
import {
  evaluateBadges,
  diffBadges,
  getAllBadgeDefinitions,
} from "../lib/badges";

export type UseBadgesReturn = {
  /** 已解锁的徽章 id。 */
  unlocked: BadgeId[];
  /** 最近一次 checkAndUnlock 的新解锁（由调用方消费后可自行清空，或不处理）。 */
  newlyUnlocked: BadgeId[];
  /** 所有徽章元数据。 */
  definitions: BadgeDefinition[];
  /**
   * 传入当前上下文，评估并解锁。
   * 幂等：多次调用不会重复解锁。
   * 返回本次新解锁的 id 数组。
   */
  checkAndUnlock: (input: BadgeCheckInput) => BadgeId[];
  /** 清除所有已解锁徽章。 */
  resetBadges: () => void;
};

/**
 * 徽章状态管理。
 *
 * 解锁只会"增加"，不会自动"减少"——即使 lesson 被 reset，已解锁徽章不会回退。
 * 这是产品决定（徽章是成就）。如需手动清除，用 resetBadges。
 */
export const useBadges = (): UseBadgesReturn => {
  const [unlocked, setUnlockedState] = useState<BadgeId[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<BadgeId[]>([]);

  useEffect(() => {
    setUnlockedState(getUnlockedBadges());
  }, []);

  const checkAndUnlock = useCallback(
    (input: BadgeCheckInput): BadgeId[] => {
      // 全局计数需要从 storage 聚合
      const globalLearnedCount = getGlobalLearnedCount();
      const shouldBeUnlocked = evaluateBadges({
        ...input,
        globalLearnedCount,
      });
      // 读最新持久化，避免 stale
      const prev = getUnlockedBadges();
      const { newlyUnlocked: added, merged } = diffBadges(
        prev,
        shouldBeUnlocked
      );
      if (added.length > 0) {
        setUnlockedBadges(merged);
        setUnlockedState(merged);
        setNewlyUnlocked(added);
        requestLocalSnapshotSync();
      }
      return added;
    },
    []
  );

  const resetBadges = useCallback(() => {
    rawRemove(STORAGE_KEYS.badges);
    setUnlockedState([]);
    setNewlyUnlocked([]);
    requestLocalSnapshotSync();
  }, []);

  return {
    unlocked,
    newlyUnlocked,
    definitions: getAllBadgeDefinitions(),
    checkAndUnlock,
    resetBadges,
  };
};
