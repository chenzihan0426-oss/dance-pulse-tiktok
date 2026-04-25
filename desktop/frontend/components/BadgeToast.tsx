"use client";

import { useEffect, useRef, useState } from "react";
import type { BadgeId } from "../lib/m5-types";
import { getBadgeDefinition } from "../lib/badges";

export type BadgeToastProps = {
  /** 本次新解锁的 badge id。每次传入新数组会依次入队展示。 */
  newlyUnlocked: BadgeId[];
  /** 每条展示时长（毫秒）。 */
  durationMs?: number;
};

type QueueItem = { id: BadgeId; key: number };

/**
 * 轻量 toast：监听 newlyUnlocked 数组变化，依次在右上角弹一条解锁提示。
 *
 * 不依赖任何外部 toast 库。未来想替换成 shadcn / sonner，只需换这个组件内部实现即可。
 * 容错：同一数组引用再次传入不会重复提示（用浅引用比较）。
 */
export const BadgeToast = ({
  newlyUnlocked,
  durationMs = 3000,
}: BadgeToastProps) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const keyCounter = useRef(0);
  const lastRef = useRef<BadgeId[] | null>(null);

  useEffect(() => {
    if (lastRef.current === newlyUnlocked) return;
    lastRef.current = newlyUnlocked;
    if (!newlyUnlocked || newlyUnlocked.length === 0) return;
    const items: QueueItem[] = newlyUnlocked.map((id) => ({
      id,
      key: ++keyCounter.current,
    }));
    setQueue((prev) => [...prev, ...items]);
  }, [newlyUnlocked]);

  useEffect(() => {
    if (queue.length === 0) return;
    const timer = setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, durationMs);
    return () => clearTimeout(timer);
  }, [queue, durationMs]);

  if (queue.length === 0) return null;

  const current = queue[0];
  const def = getBadgeDefinition(current.id);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        key={current.key}
        style={{
          background: "#1F2937",
          color: "#fff",
          padding: "12px 16px",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 260,
          maxWidth: 360,
          animation: "dp-badge-toast-in 200ms ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: def.color ?? "#E85D24",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
          aria-hidden
        >
          🏅
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            解锁徽章 · {def.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#D1D5DB",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {def.description}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes dp-badge-toast-in {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default BadgeToast;
