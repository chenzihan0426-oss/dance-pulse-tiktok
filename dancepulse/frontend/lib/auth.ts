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
