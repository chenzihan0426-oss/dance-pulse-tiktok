"use client";

import * as React from "react";
import { ParticleFieldBackground } from "./ParticleFieldBackground";
import { SceneCursor, type SceneCursorVariant } from "./SceneCursor";

/** 全页统一氛围：粒子背景 + 自定义光标 */
export function AmbientScene({
  cursorVariant = "simple",
}: {
  cursorVariant?: SceneCursorVariant;
}) {
  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const mouseRef = React.useRef({ x: -1000, y: -1000 });

  React.useEffect(() => {
    // 手机端默认关闭自定义光标（触屏）；保留粒子氛围背景色
    setShowCustomCursor(false);
    document.documentElement.style.setProperty("--dp-scene-bg", "#050505");
    const previousBg = document.body.style.background;
    document.body.style.background = "#050505";
    return () => {
      document.body.style.background = previousBg;
    };
  }, []);

  // 粒子场只读 ref；光标自行跟鼠标，避免 AmbientScene 每帧 setState
  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <ParticleFieldBackground mouseRef={mouseRef} />
      <SceneCursor variant={cursorVariant} enabled={showCustomCursor} />
    </>
  );
}
