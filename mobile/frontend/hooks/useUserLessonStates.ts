"use client";

import * as React from "react";
import {
  USER_LESSON_STATES_UPDATED_EVENT,
  getUserLessonStates,
  removeFromEnrolled as removeFromEnrolledStorage,
  restoreToEnrolled as restoreToEnrolledStorage,
  toggleFavorite as toggleFavoriteStorage,
} from "@/lib/storage";
import { requestLocalSnapshotSync } from "@/lib/api";

export function useUserLessonStates(lessonIds: string[] = []) {
  const [states, setStates] = React.useState(() => getUserLessonStates());

  React.useEffect(() => {
    const sync = () => setStates(getUserLessonStates());
    const onStatesUpdated = () => sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "dp_user_lesson_states") {
        sync();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sync();
      }
    };

    window.addEventListener(
      USER_LESSON_STATES_UPDATED_EVENT,
      onStatesUpdated as EventListener
    );
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener(
        USER_LESSON_STATES_UPDATED_EVENT,
        onStatesUpdated as EventListener
      );
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const enrolledLessons = React.useMemo(
    () => lessonIds.filter((lessonId) => states[lessonId]?.enrolled !== false),
    [lessonIds, states]
  );

  const toggleFavorite = React.useCallback((lessonId: string) => {
    toggleFavoriteStorage(lessonId);
    requestLocalSnapshotSync();
  }, []);

  const removeFromEnrolled = React.useCallback((lessonId: string) => {
    removeFromEnrolledStorage(lessonId);
    requestLocalSnapshotSync();
  }, []);

  const restoreToEnrolled = React.useCallback((lessonId: string) => {
    restoreToEnrolledStorage(lessonId);
    requestLocalSnapshotSync();
  }, []);

  return {
    states,
    enrolledLessons,
    toggleFavorite,
    removeFromEnrolled,
    restoreToEnrolled,
  };
}
