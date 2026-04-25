"use client";

import * as React from "react";
import { getImportJob } from "@/lib/api";
import type { JobStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 1400;

export function useImportJob(jobId: string | null) {
  const [job, setJob] = React.useState<JobStatus | null>(null);
  const [loading, setLoading] = React.useState(Boolean(jobId));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const next = await getImportJob(jobId);
        if (cancelled) return;
        setJob(next);
        setError(null);
        setLoading(false);

        if (next.status === "queued" || next.status === "downloading" || next.status === "processing") {
          timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [jobId]);

  return { job, loading, error };
}
