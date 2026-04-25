"use client";

import * as React from "react";

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

export interface ToastState extends ToastOptions {
  id: number;
}

export function useToast() {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const dismissToast = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = React.useCallback(
    ({ message, actionLabel, onAction, duration = 5000 }: ToastOptions) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      const nextToast: ToastState = {
        id: Date.now(),
        message,
        actionLabel,
        onAction,
        duration,
      };
      setToast(nextToast);

      timerRef.current = window.setTimeout(() => {
        setToast((current) => (current?.id === nextToast.id ? null : current));
        timerRef.current = null;
      }, duration);
    },
    []
  );

  const handleAction = React.useCallback(() => {
    const current = toast;
    dismissToast();
    current?.onAction?.();
  }, [dismissToast, toast]);

  React.useEffect(() => dismissToast, [dismissToast]);

  return {
    toast,
    showToast,
    dismissToast,
    handleAction,
  };
}
