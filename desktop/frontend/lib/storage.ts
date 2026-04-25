/**
 * 存储层：安全 localStorage 封装。
 *
 * 设计目标：
 * - SSR 兼容：服务端不访问 window，读操作返回 null / 空数组。
 * - 容错：localStorage 不可用（隐私模式、配额、JSON 损坏）时自动 fallback 到模块级内存 Map。
 * - 所有业务代码只通过这里读写，不直接碰 localStorage。
 */

import { STORAGE_KEYS, learnedKey } from "./m5-types";
import type { UserLessonState } from "./types";

export const PROGRESS_UPDATED_EVENT = "dp-progress-updated";
export const USER_LESSON_STATES_UPDATED_EVENT = "dp-user-lesson-states-updated";
const USER_LESSON_STATES_KEY = "dp_user_lesson_states";

// ---------- 底层 raw 存储 ----------

/** 内存 fallback。localStorage 不可用时使用。 */
const memoryStore = new Map<string, string>();

/** 运行态标记：是否已确认过 localStorage 可用。lazy 检测。 */
let localStorageUsable: boolean | null = null;

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/** 探测 localStorage 是否真的能写（有些浏览器有 window.localStorage 但隐私模式下 setItem 抛）。 */
const probeLocalStorage = (): boolean => {
  if (!isBrowser()) return false;
  try {
    const probeKey = "__dp_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
};

const canUseLocalStorage = (): boolean => {
  if (localStorageUsable === null) {
    localStorageUsable = probeLocalStorage();
  }
  return localStorageUsable;
};

/** 读原始字符串。SSR 或异常时返回 null。 */
export const rawGet = (key: string): string | null => {
  if (canUseLocalStorage()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // 读失败，降级到内存
    }
  }
  return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
};

/** 写原始字符串。失败时写到内存 fallback。 */
export const rawSet = (key: string, value: string): void => {
  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // 配额或其他问题，降级到内存
    }
  }
  memoryStore.set(key, value);
};

/** 删除一个 key。localStorage 和内存都清。 */
export const rawRemove = (key: string): void => {
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  memoryStore.delete(key);
};

/** 扫描所有以某个 prefix 开头的 key。合并 localStorage 与内存的 key 去重。 */
export const rawKeysWithPrefix = (prefix: string): string[] => {
  const keys = new Set<string>();
  if (canUseLocalStorage()) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.add(k);
      }
    } catch {
      // ignore
    }
  }
  for (const k of memoryStore.keys()) {
    if (k.startsWith(prefix)) keys.add(k);
  }
  return Array.from(keys);
};

// ---------- JSON 安全读写 ----------

/** 读 JSON。解析失败返回 fallback（不抛）。 */
export const readJSON = <T>(key: string, fallback: T): T => {
  const raw = rawGet(key);
  if (raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** 写 JSON。序列化失败静默忽略（基本不可能，但兜底）。 */
export const writeJSON = (key: string, value: unknown): void => {
  try {
    rawSet(key, JSON.stringify(value));
  } catch {
    // 非常极端的循环引用等情况，静默忽略
  }
};

// ---------- 业务层封装 ----------

export const getLearnedIds = (lessonId: string): string[] => {
  const arr = readJSON<string[]>(learnedKey(lessonId), []);
  // 防御：存储被人工改坏时，过滤掉非字符串
  return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
};

export const getAllLearnedByLesson = (): Record<string, string[]> => {
  const keys = rawKeysWithPrefix(STORAGE_KEYS.learnedPrefix);
  const result: Record<string, string[]> = {};
  for (const key of keys) {
    const lessonId = key.slice(STORAGE_KEYS.learnedPrefix.length);
    result[lessonId] = getLearnedIds(lessonId);
  }
  return result;
};

const emitProgressUpdated = (lessonId: string): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROGRESS_UPDATED_EVENT, {
      detail: { lessonId },
    })
  );
};

const emitUserLessonStatesUpdated = (lessonId?: string): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(USER_LESSON_STATES_UPDATED_EVENT, {
      detail: { lessonId: lessonId ?? null },
    })
  );
};

export const setLearnedIds = (lessonId: string, ids: string[]): void => {
  // 去重且保持顺序
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  writeJSON(learnedKey(lessonId), deduped);
  emitProgressUpdated(lessonId);
};

export const clearLearnedIds = (lessonId: string): void => {
  rawRemove(learnedKey(lessonId));
  emitProgressUpdated(lessonId);
};

const lastViewedSegmentKey = (lessonId: string): string => `dp:last-segment:${lessonId}`;

export const getLastViewedSegmentId = (lessonId: string): string | null => {
  const value = rawGet(lastViewedSegmentKey(lessonId));
  return value && value.trim() ? value : null;
};

export const setLastViewedSegmentId = (lessonId: string, segmentId: string): void => {
  if (!lessonId || !segmentId) return;
  rawSet(lastViewedSegmentKey(lessonId), segmentId);
  emitProgressUpdated(lessonId);
};

export const getLastViewedSegmentIds = (): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const key of rawKeysWithPrefix("dp:last-segment:")) {
    const lessonId = key.slice("dp:last-segment:".length);
    result[lessonId] = rawGet(key);
  }
  return result;
};

const buildDefaultUserLessonState = (lessonId: string): UserLessonState => ({
  lessonId,
  enrolled: true,
  favorited: false,
  lastStudiedAt: null,
});

export const getUserLessonStates = (): Record<string, UserLessonState> => {
  const raw = readJSON<Record<string, UserLessonState>>(USER_LESSON_STATES_KEY, {});
  const next: Record<string, UserLessonState> = {};

  for (const [lessonId, state] of Object.entries(raw)) {
    if (!lessonId || !state || typeof state !== "object") continue;
    next[lessonId] = {
      lessonId,
      enrolled: state.enrolled !== false,
      favorited: Boolean(state.favorited),
      lastStudiedAt:
        typeof state.lastStudiedAt === "string" && state.lastStudiedAt.trim()
          ? state.lastStudiedAt
          : null,
    };
  }

  return next;
};

export const replaceUserLessonStates = (states: Record<string, UserLessonState>): void => {
  writeUserLessonStates(states);
  emitUserLessonStatesUpdated();
};

const writeUserLessonStates = (states: Record<string, UserLessonState>): void => {
  writeJSON(USER_LESSON_STATES_KEY, states);
};

export const setUserLessonState = (
  lessonId: string,
  partial: Partial<UserLessonState>
): void => {
  if (!lessonId) return;
  const states = getUserLessonStates();
  const current = states[lessonId] ?? buildDefaultUserLessonState(lessonId);
  states[lessonId] = {
    ...current,
    ...partial,
    lessonId,
  };
  writeUserLessonStates(states);
  emitUserLessonStatesUpdated(lessonId);
};

export const removeFromEnrolled = (lessonId: string): void => {
  setUserLessonState(lessonId, { enrolled: false });
};

export const restoreToEnrolled = (lessonId: string): void => {
  setUserLessonState(lessonId, { enrolled: true });
};

export const toggleFavorite = (lessonId: string): void => {
  const states = getUserLessonStates();
  const current = states[lessonId] ?? buildDefaultUserLessonState(lessonId);
  setUserLessonState(lessonId, { favorited: !current.favorited });
};

/**
 * 扫描所有 lesson 的已学会 segment，按 (lessonId, segmentId) 去重计数。
 * 返回唯一 segment 总数。
 */
export const getGlobalLearnedCount = (): number => {
  const keys = rawKeysWithPrefix(STORAGE_KEYS.learnedPrefix);
  const seen = new Set<string>();
  for (const key of keys) {
    const lessonId = key.slice(STORAGE_KEYS.learnedPrefix.length);
    const ids = readJSON<string[]>(key, []);
    if (!Array.isArray(ids)) continue;
    for (const segId of ids) {
      if (typeof segId === "string") seen.add(`${lessonId}:${segId}`);
    }
  }
  return seen.size;
};

// ---------- 徽章 ----------

import type { BadgeId } from "./m5-types";

export const getUnlockedBadges = (): BadgeId[] => {
  const arr = readJSON<BadgeId[]>(STORAGE_KEYS.badges, []);
  return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") as BadgeId[] : [];
};

export const setUnlockedBadges = (ids: BadgeId[]): void => {
  // 去重
  const deduped = Array.from(new Set(ids));
  writeJSON(STORAGE_KEYS.badges, deduped);
};

// ---------- 活跃状态 ----------

import type { ActivityState } from "./m5-types";

const DEFAULT_ACTIVITY: ActivityState = {
  lastActiveDate: null,
  currentStreak: 0,
};

export const getActivity = (): ActivityState => {
  const raw = readJSON<ActivityState>(STORAGE_KEYS.activity, DEFAULT_ACTIVITY);
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ACTIVITY };
  const lastActiveDate =
    typeof raw.lastActiveDate === "string" ? raw.lastActiveDate : null;
  const currentStreak =
    typeof raw.currentStreak === "number" && raw.currentStreak >= 0
      ? raw.currentStreak
      : 0;
  return { lastActiveDate, currentStreak };
};

export const setActivity = (state: ActivityState): void => {
  writeJSON(STORAGE_KEYS.activity, state);
};

// ---------- 调试工具 ----------

/**
 * 清掉所有 M5 相关的持久化数据：
 * - 所有 dp:learned:* key
 * - dp:badges
 * - dp:activity
 * 不影响其他模块的 key。
 */
export const resetAll = (): void => {
  const learnedKeys = rawKeysWithPrefix(STORAGE_KEYS.learnedPrefix);
  for (const k of learnedKeys) rawRemove(k);
  rawRemove(STORAGE_KEYS.badges);
  rawRemove(STORAGE_KEYS.activity);
};

/** 测试专用：清空内存 fallback 和探测缓存。生产代码不应调用。 */
export const __resetStorageForTests = (): void => {
  memoryStore.clear();
  localStorageUsable = null;
};

/** 测试专用：强制 localStorage 不可用，走内存路径。 */
export const __forceMemoryFallback = (): void => {
  localStorageUsable = false;
};
