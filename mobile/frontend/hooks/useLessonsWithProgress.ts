"use client";

import * as React from "react";
import { getLessons } from "@/lib/api";
import {
  buildLessonProgressMaps,
  type ProgressMap,
  type ResumeMap,
} from "@/lib/lesson-progress";
import { PROGRESS_UPDATED_EVENT } from "@/lib/storage";
import type { LessonListItem } from "@/lib/types";

type LoadOptions = {
  quiet?: boolean;
};

export function useLessonsWithProgress() {
  const [lessons, setLessons] = React.useState<LessonListItem[]>([]);
  const [progressMap, setProgressMap] = React.useState<ProgressMap>({});
  const [resumeMap, setResumeMap] = React.useState<ResumeMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const mountedRef = React.useRef(false);
  const requestIdRef = React.useRef(0);

  const load = React.useCallback(async (options: LoadOptions = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!options.quiet) {
      setLoading(true);
    }
    setError(null);

    try {
      const list = await getLessons();
      const maps = await buildLessonProgressMaps(list);

      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLessons(list);
      setProgressMap(maps.progressMap);
      setResumeMap(maps.resumeMap);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void load();

    const refreshQuietly = () => {
      void load({ quiet: true });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void load({ quiet: true });
      }
    };

    window.addEventListener(PROGRESS_UPDATED_EVENT, refreshQuietly as EventListener);
    window.addEventListener("focus", refreshQuietly);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.removeEventListener(PROGRESS_UPDATED_EVENT, refreshQuietly as EventListener);
      window.removeEventListener("focus", refreshQuietly);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const reload = React.useCallback(() => load(), [load]);

  return {
    lessons,
    progressMap,
    resumeMap,
    loading,
    error,
    reload,
  };
}
