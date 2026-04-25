"use client";

// 用户画面叠加层 —— 把老师精细轮廓 + 粒子闪烁叠在你的摄像头上。
//
// 数据来源:
//   1. 老师视频(clip_url 在左面板播放) → 作为像素源
//   2. MediaPipe ImageSegmenter → person mask,限定"只对人身上的边生效"
//   3. Sobel 边缘检测 → 抓出头发、衣纹、鞋边、口袋、皮带扣等所有可见轮廓
//   4. 时间驱动的 shimmer + reservoir 采样粒子 → 视觉参考图 2 的"流动荧光边"
//
// 降级:没拿到 teacherVideoRef 时回到 drawGhostOutline(用 pose JSON 画身体轮廓)。
//
// 镜像:canvas 通过 CSS transform:scaleX(-1) 整体翻转,匹配 mirror 的用户摄像头。

import * as React from "react";

import { getImageSegmenter } from "@/lib/pose/mediapipeClient";
import { drawGhostOutline } from "@/lib/pose/skeleton";
import { loadPoseDoc, sampleFrame, type PoseDoc } from "@/lib/pose/types";
import { detectPersonEdges } from "@/lib/pose/videoEdges";

export type OverlayStatus =
  | "loading-model"
  | "loading-teacher"
  | "ready"
  | "error";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  // 老师视频 ref —— 传入后启用精细像素边缘模式;不传则用 pose JSON 降级
  teacherVideoRef?: React.RefObject<HTMLVideoElement>;
  teacherPoseUrl?: string;
  playheadSec?: number;
  userMirror?: boolean;
  active?: boolean;
  // 废弃,保留以兼容旧调用
  showUserSkeleton?: boolean;
  className?: string;
  onStatus?: (status: OverlayStatus) => void;
}

const OUTLINE_COLOR = "#f2ecff";
// Sobel/边缘检测的工作分辨率。与 Selfie Segmenter 输出一致 → 不用 resample mask。
const EDGE_W = 256;
const EDGE_H = 256;

export default function SilhouetteOverlay({
  videoRef,
  teacherVideoRef,
  teacherPoseUrl,
  playheadSec,
  userMirror = true,
  active = true,
  className,
  onStatus,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // 存放每帧边缘图的离屏 canvas
  const edgeOffscreenRef = React.useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = React.useState<OverlayStatus>("loading-model");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const teacherDocRef = React.useRef<PoseDoc | null>(null);
  const playheadRef = React.useRef<number | undefined>(playheadSec);
  React.useEffect(() => {
    playheadRef.current = playheadSec;
  }, [playheadSec]);

  React.useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // ---------- 老师 pose JSON(降级用) ----------
  React.useEffect(() => {
    let cancelled = false;
    if (!teacherPoseUrl) {
      teacherDocRef.current = null;
      return;
    }
    loadPoseDoc(teacherPoseUrl)
      .then((doc) => {
        if (!cancelled) teacherDocRef.current = doc;
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[SilhouetteOverlay] pose JSON 加载失败:", err);
          teacherDocRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teacherPoseUrl]);

  // ---------- RAF 主循环 ----------
  React.useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    let disposed = false;
    let lastSegTs = -1;
    const autoLoopStart = performance.now();

    // 让单帧错误至多只打一次 warning,避免刷屏
    let edgeErrorLogged = false;

    const run = async () => {
      // 只在有老师视频时才启动 segmenter(用 pose JSON 降级时不需要)
      let segmenter = null as Awaited<ReturnType<typeof getImageSegmenter>> | null;
      if (teacherVideoRef) {
        try {
          segmenter = await getImageSegmenter();
        } catch (err) {
          console.warn("[SilhouetteOverlay] ImageSegmenter 加载失败,降级到 pose ghost:", err);
          segmenter = null;
        }
      }
      if (disposed) return;
      setStatus("ready");

      const tick = () => {
        if (disposed) return;
        const canvas = canvasRef.current;
        const userVideo = videoRef.current;
        if (!canvas || !userVideo || userVideo.readyState < 2) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        const vw = userVideo.videoWidth || userVideo.clientWidth;
        const vh = userVideo.videoHeight || userVideo.clientHeight;
        if (!vw || !vh) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        ctx.clearRect(0, 0, vw, vh);

        const teacherVideo = teacherVideoRef?.current;
        const canDoEdges =
          segmenter &&
          teacherVideo &&
          teacherVideo.readyState >= 2 &&
          teacherVideo.videoWidth > 0;

        if (canDoEdges && teacherVideo && segmenter) {
          // ========== 精细边缘模式 ==========
          const nowMs = performance.now();
          const segTs = Math.max(lastSegTs + 1, Math.floor(nowMs));
          lastSegTs = segTs;
          try {
            const segResult = segmenter.segmentForVideo(teacherVideo, segTs);
            const mask = segResult.categoryMask;
            let maskBytes: Uint8Array | null = null;
            if (mask) {
              maskBytes = mask.getAsUint8Array();
            }

            const { image: edgeImage, sparklePoints } = detectPersonEdges(
              teacherVideo,
              maskBytes,
              EDGE_W,
              EDGE_H,
              {
                sobelThreshold: 22,
                strength: 2.4,
                shimmerPhase: nowMs / 1000,
                numSparkles: 36,
              },
            );

            if (mask) mask.close();

            // 离屏 canvas 放边缘图,之后多次 drawImage 产生发光
            let edgeOff = edgeOffscreenRef.current;
            if (!edgeOff) {
              edgeOff = document.createElement("canvas");
              edgeOffscreenRef.current = edgeOff;
            }
            if (edgeOff.width !== EDGE_W || edgeOff.height !== EDGE_H) {
              edgeOff.width = EDGE_W;
              edgeOff.height = EDGE_H;
            }
            const edgeCtx = edgeOff.getContext("2d");
            if (edgeCtx) {
              edgeCtx.clearRect(0, 0, EDGE_W, EDGE_H);
              edgeCtx.putImageData(edgeImage, 0, 0);

              // 老师视频的实际像素尺寸(非 256×256,是 videoW × videoH)
              // 用 contain 方式放到用户画布里,保持老师视频原始宽高比
              const tw = teacherVideo.videoWidth;
              const th = teacherVideo.videoHeight;
              const fitScale = Math.min(vw / tw, vh / th);
              const dw = tw * fitScale;
              const dh = th * fitScale;
              const dx = (vw - dw) / 2;
              const dy = (vh - dh) / 2;

              ctx.save();
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";

              // 三层叠绘:远光晕 → 中光 → 锐利核心
              ctx.shadowColor = OUTLINE_COLOR;

              ctx.globalAlpha = 0.32;
              ctx.shadowBlur = 16;
              ctx.drawImage(edgeOff, 0, 0, EDGE_W, EDGE_H, dx, dy, dw, dh);

              ctx.globalAlpha = 0.55;
              ctx.shadowBlur = 7;
              ctx.drawImage(edgeOff, 0, 0, EDGE_W, EDGE_H, dx, dy, dw, dh);

              ctx.shadowBlur = 0;
              ctx.globalAlpha = 0.95;
              ctx.drawImage(edgeOff, 0, 0, EDGE_W, EDGE_H, dx, dy, dw, dh);

              // 粒子:在采样到的边缘点上画亮闪
              ctx.shadowColor = "#ffffff";
              ctx.shadowBlur = 8;
              ctx.fillStyle = "#ffffff";
              for (let i = 0; i < sparklePoints.length; i += 2) {
                const nx = sparklePoints[i];
                const ny = sparklePoints[i + 1];
                const sx = dx + nx * dw;
                const sy = dy + ny * dh;
                // 半径随时间 + 位置做微小抖动,看着像呼吸
                const r =
                  0.9 +
                  1.1 *
                    Math.abs(Math.sin(nowMs / 220 + nx * 9 + ny * 7));
                const a = 0.5 + 0.5 * Math.sin(nowMs / 180 + nx * 11 + ny * 13);
                ctx.globalAlpha = 0.35 + 0.55 * a;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
            }
          } catch (err) {
            // 单帧失败不中断 RAF,但第一次要打出来,不然调试时完全看不出为什么黑
            if (!edgeErrorLogged) {
              edgeErrorLogged = true;
              console.warn(
                "[SilhouetteOverlay] 老师视频像素读取失败(后续帧会静默继续):",
                err,
              );
            }
          }
        } else if (teacherDocRef.current) {
          // ========== 降级:pose JSON ghost 轮廓 ==========
          const teacher = teacherDocRef.current;
          const head = playheadRef.current;
          const t =
            typeof head === "number"
              ? head
              : ((performance.now() - autoLoopStart) / 1000) %
                (teacher.end - teacher.start || 1);
          const frame = sampleFrame(teacher, t);
          if (frame?.kp) {
            drawGhostOutline(ctx, frame.kp, vw, vh, {
              color: OUTLINE_COLOR,
              alpha: 0.72,
              glowBlur: 22,
              innerScale: 0.88,
              mirror: false,
            });
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    run().catch((err) => {
      console.warn("[SilhouetteOverlay] run 失败:", err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    });

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // 不追踪 playheadSec / teacherPoseUrl:内部通过 ref 每帧读取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videoRef, teacherVideoRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className ?? "pointer-events-none absolute inset-0 h-full w-full"}
        style={{ transform: userMirror ? "scaleX(-1)" : undefined }}
        aria-hidden
      />
      {status === "error" && errorMsg ? (
        <div className="absolute inset-x-3 top-3 rounded-xl bg-red-600/80 px-3 py-2 text-[12px] text-white">
          轮廓引擎加载失败: {errorMsg}
        </div>
      ) : null}
    </>
  );
}
