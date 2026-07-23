"use client";

import type { AuthSession, LocalProgressSnapshot } from "./types";
import type { BadgeId } from "./m5-types";
import {
  getActivity,
  getAllLearnedByLesson,
  getLastViewedSegmentIds,
  getUnlockedBadges,
  getUserLessonStates,
  rawKeysWithPrefix,
  rawRemove,
  setActivity,
  setLastViewedSegmentId,
  setLearnedIds,
  setUnlockedBadges,
  replaceUserLessonStates,
} from "./storage";

const AUTH_SESSION_KEY = "dp_auth_session";
export const AUTH_CHANGED_EVENT = "dp-auth-changed";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emitAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

export function getAuthSession(): AuthSession | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getAuthSession()?.token ?? null;
}

export function setAuthSession(session: AuthSession): void {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  emitAuthChanged();
}

export function clearAuthSession(): void {
  if (!canUseBrowserStorage()) return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  emitAuthChanged();
}

export function hasAuthSession(): boolean {
  return Boolean(getAuthSession()?.token);
}

/** 演示假登录 token（本机写入，后端不认） */
export function isDemoAuthToken(token: string | null | undefined): boolean {
  return Boolean(token && token.startsWith("demo_"));
}

export function isDemoAuthSession(session: AuthSession | null | undefined): boolean {
  return isDemoAuthToken(session?.token) || Boolean(session?.user?.id?.startsWith("demo_"));
}

/** 演示假登录：账号/密码任意非空字符串即可，写入本机 session。 */
export function loginWithAnyPassword(account: string, password: string): AuthSession {
  const name = account.trim();
  if (!name) throw new Error("请输入账号");
  if (!password.trim()) throw new Error("请输入密码");

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fff]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const username = slug || `user_${Date.now().toString(36).slice(-6)}`;
  const now = new Date().toISOString();
  const session: AuthSession = {
    token: `demo_${username}_${Date.now().toString(36)}`,
    user: {
      id: `demo_${username}`,
      phone: "",
      username,
      displayName: name,
      avatar: null,
      bio: "演示账号 · 任意密码登录",
      isVerified: false,
      createdAt: now,
    },
  };
  setAuthSession(session);
  return session;
}

export function buildLocalProgressSnapshot(): LocalProgressSnapshot {
  return {
    learnedByLesson: getAllLearnedByLesson(),
    badges: getUnlockedBadges(),
    activity: getActivity(),
    userLessonStates: getUserLessonStates(),
    lastViewedSegmentIds: getLastViewedSegmentIds(),
  };
}

export function applyLocalProgressSnapshot(snapshot: LocalProgressSnapshot): void {
  for (const key of rawKeysWithPrefix("dp:learned:")) {
    rawRemove(key);
  }
  for (const [lessonId, ids] of Object.entries(snapshot.learnedByLesson ?? {})) {
    setLearnedIds(lessonId, ids);
  }

  setUnlockedBadges((snapshot.badges ?? []).filter((item): item is BadgeId => typeof item === "string"));
  setActivity(snapshot.activity ?? { lastActiveDate: null, currentStreak: 0 });
  replaceUserLessonStates(snapshot.userLessonStates ?? {});

  for (const key of rawKeysWithPrefix("dp:last-segment:")) {
    rawRemove(key);
  }
  for (const [lessonId, segmentId] of Object.entries(snapshot.lastViewedSegmentIds ?? {})) {
    if (segmentId) {
      setLastViewedSegmentId(lessonId, segmentId);
    }
  }
}
