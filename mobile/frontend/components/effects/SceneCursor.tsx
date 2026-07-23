"use client";

import * as React from "react";

export type SceneCursorVariant = "hero" | "simple";

const HOVER_SELECTOR =
  "a,button,input,textarea,select,label,[role='button'],[data-cursor-hover],.cursor-pointer";

/**
 * hero：首页双环光标
 * simple：其它页空心箭头，描边贴合霓虹粒子背景
 *
 * 位置用 ref 直写 DOM + rAF，避免 React setState 与 transform transition 造成拖尾延迟。
 */
export function SceneCursor({
  variant = "simple",
  enabled,
}: {
  variant?: SceneCursorVariant;
  enabled: boolean;
}) {
  const rootRef = React.useRef<HTMLElement | SVGSVGElement | null>(null);
  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const hoveringRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;

    // 强制隐藏系统光标（含 button/a 上的 cursor:pointer 手形），只保留自定义指针。
    const style = document.createElement("style");
    style.setAttribute("data-dp-hide-native-cursor", "1");
    style.textContent = `
      html.dp-custom-cursor, html.dp-custom-cursor * , html.dp-custom-cursor *::before, html.dp-custom-cursor *::after {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add("dp-custom-cursor");

    let x = -1000;
    let y = -1000;
    let raf = 0;
    let queued = false;

    const paint = () => {
      queued = false;
      const root = rootRef.current;
      if (!root) return;

      const hovering = hoveringRef.current;

      if (variant === "simple") {
        root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        root.style.color = hovering ? "#ccff00" : "#00f3ff";
        return;
      }

      const scaleDot = hovering ? 0.5 : 1;
      const scaleRing = hovering ? 1.5 : 1;
      root.style.transform = `translate3d(${x - 6}px, ${y - 6}px, 0) scale(${scaleDot})`;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0) scale(${scaleRing})`;
        ringRef.current.style.opacity = hovering ? "0.8" : "0.3";
        ringRef.current.style.borderColor = hovering ? "#ff0055" : "#00f3ff";
      }
    };

    const onMove = (event: MouseEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(paint);
    };

    const onOver = (event: MouseEvent) => {
      const target = event.target;
      const next =
        target instanceof Element ? Boolean(target.closest(HOVER_SELECTOR)) : false;
      if (next === hoveringRef.current) return;
      hoveringRef.current = next;
      if (!queued) {
        queued = true;
        raf = requestAnimationFrame(paint);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    paint();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.documentElement.classList.remove("dp-custom-cursor");
      style.remove();
    };
  }, [enabled, variant]);

  if (!enabled) return null;

  if (variant === "simple") {
    return (
      <svg
        ref={(node) => {
          rootRef.current = node;
        }}
        className="pointer-events-none fixed left-0 top-0 z-[100] text-[#00f3ff]"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        style={{
          transform: "translate3d(-1000px, -1000px, 0)",
          willChange: "transform",
          opacity: 0.92,
        }}
        aria-hidden
      >
        <path
          d="M4 3 L4 22 L10.2 16.4 L15.8 25.2 L18.6 23.6 L13 14.8 L21 14.8 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M5.4 5.2 L5.4 18.6 L10.6 14.2 L15.4 21.6 L16.8 20.8 L12 13.4 L18.4 13.4 Z"
          fill="rgba(5,5,5,0.35)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <>
      <div
        ref={(node) => {
          rootRef.current = node;
        }}
        className="pointer-events-none fixed left-0 top-0 z-[100] h-3 w-3 rounded-full bg-[#ccff00] mix-blend-difference"
        style={{
          transform: "translate3d(-1000px, -1000px, 0)",
          willChange: "transform",
        }}
      />
      <div
        ref={ringRef}
        className="pointer-events-none fixed left-0 top-0 z-[100] h-10 w-10 rounded-full border mix-blend-screen"
        style={{
          transform: "translate3d(-1000px, -1000px, 0)",
          opacity: 0.3,
          borderColor: "#00f3ff",
          willChange: "transform, opacity, border-color",
        }}
      />
    </>
  );
}
