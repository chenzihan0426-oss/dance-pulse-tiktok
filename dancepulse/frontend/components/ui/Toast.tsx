"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ToastState } from "@/hooks/useToast";

export function Toast({
  toast,
  onAction,
  onClose,
}: {
  toast: ToastState | null;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-x-5 bottom-[88px] z-50 mx-auto max-w-md md:bottom-6 md:max-w-lg"
        >
          <div className="flex items-center justify-between gap-4 rounded-[20px] border border-white/8 bg-bg-surface px-4 py-3 text-sm text-white shadow-[0_16px_32px_rgba(0,0,0,0.28)]">
            <span className="min-w-0 flex-1 leading-6 text-white/88">{toast.message}</span>
            <div className="flex shrink-0 items-center gap-3">
              {toast.actionLabel ? (
                <button
                  type="button"
                  onClick={onAction}
                  className="text-[13px] font-medium text-brand-light transition hover:text-white"
                >
                  {toast.actionLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] text-white/35 transition hover:text-white/72"
                aria-label="关闭提示"
              >
                关闭
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
