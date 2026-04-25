"use client";

// 用户画面叠加层 —— 基于 RVM 离线 matte 的"剪影舞者"叠加,走 Three.js + WebGL。
//
// 数据来源(离线预处理产物):
//   - matte_rgb_url  : 老师前景 RGB 视频(背景被 RVM 抹掉)
//   - matte_mask_url : 老师 alpha mask 视频(灰度编码,R=alpha)
//
// 渲染管线:
//   Layer 0: 透明(用户摄像头在下面的 <video> 里,本 overlay 的 canvas 盖在其上)
//   Layer 1: 自定义 ShaderMaterial 把 rgb * mask 合成,额外做多级高斯 bloom
//   Layer 2: UnrealBloomPass 后期强化光晕
//
// 镜像:canvas 用 CSS transform:scaleX(-1) 翻转,对齐 mirror 的用户摄像头。

import * as React from "react";
import * as THREE from "three";

export type MatteOverlayStatus = "idle" | "loading" | "ready" | "error";

const MATTE_TARGET_FPS = 24;

interface Props {
  rgbUrl: string;                                    // 老师前景 RGB 视频 URL
  maskUrl: string;                                   // 老师 alpha mask 视频 URL
  userMirror?: boolean;                              // canvas 是否水平翻转
  // 当父组件要和左面板老师视频同步播放进度时,传进来两个命令:
  playing?: boolean;                                  // true → video.play(),false → pause
  playbackRate?: number;                              // 0.5 | 1
  currentTimeSec?: number;                            // 外部 seek(秒);不传则内部自由循环
  // 控制视觉强度
  bloomStrength?: number;                             // 默认 1.4
  bloomRadius?: number;                               // 默认 0.6
  bloomThreshold?: number;                            // 默认 0.02
  silhouetteScale?: number;
  silhouetteOffsetX?: number;
  silhouetteOffsetY?: number;
  edgeBoost?: number;
  detailBoost?: number;
  overlayOpacity?: number;
  onStatus?: (s: MatteOverlayStatus) => void;
  onTimeUpdate?: (tSec: number) => void;
  className?: string;
}

// 自定义 shader:rgb 用 mask 做透明度抠出前景,并叠一层额外的边缘光
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uRgb;
  uniform sampler2D uMask;
  uniform vec2 uTexel;
  uniform vec3 uGlowColor;       // 外发光颜色(白偏金)
  uniform vec3 uEdgeColor;       // 边缘闪亮颜色(更亮的金)
  uniform float uEdgeBoost;      // 外轮廓亮度增益
  uniform float uDetailBoost;    // 内部细节增益
  uniform float uShimmer;        // [0,1] 周期呼吸,脉冲亮度
  uniform float uShimmerSweep;   // [0,1] 自上而下扫光位置
  uniform float uOpacity;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // 3x3 高斯权重模糊 (9 tap),权重 exp(-d^2/2)
  float gauss9(sampler2D tex, vec2 uv, float r) {
    float s = 0.0;
    float w = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec2 o = vec2(float(x), float(y)) * uTexel * r;
        float wt = exp(-float(x*x + y*y) / 2.0);
        s += texture2D(tex, uv + o).r * wt;
        w += wt;
      }
    }
    return s / w;
  }

  // 5-tap cross pattern (十字采样),比 3x3 更省,但细节差一点
  float gauss5(sampler2D tex, vec2 uv, float r) {
    float c = texture2D(tex, uv).r * 0.36;
    c += texture2D(tex, uv + vec2( uTexel.x * r, 0.0)).r * 0.16;
    c += texture2D(tex, uv + vec2(-uTexel.x * r, 0.0)).r * 0.16;
    c += texture2D(tex, uv + vec2(0.0,  uTexel.y * r)).r * 0.16;
    c += texture2D(tex, uv + vec2(0.0, -uTexel.y * r)).r * 0.16;
    return c;
  }

  // Sobel on RGB (9 tap),通道最大梯度,比 luma 更灵敏
  float sobelRGB(vec2 uv, float r) {
    vec3 tl = texture2D(uRgb, uv + vec2(-1.0,-1.0) * uTexel * r).rgb;
    vec3 tm = texture2D(uRgb, uv + vec2( 0.0,-1.0) * uTexel * r).rgb;
    vec3 tr = texture2D(uRgb, uv + vec2( 1.0,-1.0) * uTexel * r).rgb;
    vec3 ml = texture2D(uRgb, uv + vec2(-1.0, 0.0) * uTexel * r).rgb;
    vec3 mr = texture2D(uRgb, uv + vec2( 1.0, 0.0) * uTexel * r).rgb;
    vec3 bl = texture2D(uRgb, uv + vec2(-1.0, 1.0) * uTexel * r).rgb;
    vec3 bm = texture2D(uRgb, uv + vec2( 0.0, 1.0) * uTexel * r).rgb;
    vec3 br = texture2D(uRgb, uv + vec2( 1.0, 1.0) * uTexel * r).rgb;
    vec3 gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    vec3 gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
    vec3 mag = sqrt(gx*gx + gy*gy);
    return max(max(mag.r, max(mag.g, mag.b)), luma(mag));
  }

  void main() {
    float alpha = texture2D(uMask, vUv).r;

    // 1. 外轮廓: 用 gauss9 做 DoG,9-tap 精度对身体边线足够,粗细不变
    float mIn = gauss9(uMask, vUv, 1.3);
    float mOut = gauss9(uMask, vUv, 2.8);
    float outlineDog = clamp((mIn - mOut) * 2.6, 0.0, 1.0);
    float outlineErode = clamp(alpha - mOut, 0.0, 1.0);
    float outline = max(outlineDog, outlineErode);

    // 2. 内部细节: 单尺度 Sobel + smoothstep (前两尺度合并合起来差别不大)
    float detailRaw = sobelRGB(vUv, 1.2);
    float detailGate = smoothstep(0.22, 0.62, alpha);
    float detail = smoothstep(0.08, 0.42, detailRaw) * detailGate;

    // 3. 外发光壳层 (用 5-tap 大半径,比 9-tap 省一半采样)
    float g1 = gauss5(uMask, vUv, 4.0);
    float g2 = gauss5(uMask, vUv, 11.0);
    float glowShell = clamp(g1 - alpha, 0.0, 1.0) * 0.7
                    + clamp(g2 - alpha, 0.0, 1.0) * 0.35;

    // 4. 动态边缘闪亮:
    //    (a) 全局呼吸 — uShimmer 周期 0.88-1.0 微跳
    //    (b) 扫光带  — uShimmerSweep 在 vUv.y 上做一道 0.12 宽的高斯带,使轮廓沿身体自上而下流一遍
    float breathe = 0.92 + uShimmer * 0.18;
    float sweepDist = abs(vUv.y - uShimmerSweep);
    float sweep = exp(-sweepDist * sweepDist / 0.006) * 0.55;

    // 5. 合成: 外轮廓用更亮的 uEdgeColor + 扫光;主体暖白
    float lineIntensity = outline * uEdgeBoost + detail * uDetailBoost;
    vec3 outlineTint = mix(uGlowColor, uEdgeColor, clamp(outline * (0.7 + sweep), 0.0, 1.0));
    vec3 color = outlineTint * lineIntensity * breathe + uGlowColor * glowShell;

    // 扫光只加亮轮廓位置,不喷面积
    color += uEdgeColor * outline * sweep * 1.4;

    float outA = clamp(lineIntensity * 1.15 * breathe + glowShell, 0.0, 1.0);
    gl_FragColor = vec4(color * uOpacity, outA * uOpacity);
  }
`;

export default function MatteOverlay({
  rgbUrl,
  maskUrl,
  userMirror = true,
  playing = true,
  playbackRate = 1,
  currentTimeSec,
  bloomStrength = 1.4,
  bloomRadius = 0.6,
  bloomThreshold = 0.02,
  silhouetteScale = 1,
  silhouetteOffsetX = 0,
  silhouetteOffsetY = 0,
  edgeBoost = 3.4,
  detailBoost = 2.6,
  overlayOpacity = 1,
  onStatus,
  onTimeUpdate,
  className,
}: Props) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  // 两个 <video> 都挂在组件内但不显示;只作为 Three.js VideoTexture 源
  const rgbVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const maskVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = React.useState<MatteOverlayStatus>("idle");

  // 外部控制 props 通过 ref 透传,避免 RAF 闭包陈旧
  const playingRef = React.useRef(playing);
  const rateRef = React.useRef(playbackRate);
  const seekRef = React.useRef<number | undefined>(currentTimeSec);
  const visualRef = React.useRef({
    scale: silhouetteScale,
    offsetX: silhouetteOffsetX,
    offsetY: silhouetteOffsetY,
    edgeBoost,
    detailBoost,
    opacity: overlayOpacity,
  });
  React.useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  React.useEffect(() => {
    rateRef.current = playbackRate;
  }, [playbackRate]);
  React.useEffect(() => {
    seekRef.current = currentTimeSec;
  }, [currentTimeSec]);
  React.useEffect(() => {
    visualRef.current = {
      scale: silhouetteScale,
      offsetX: silhouetteOffsetX,
      offsetY: silhouetteOffsetY,
      edgeBoost,
      detailBoost,
      opacity: overlayOpacity,
    };
  }, [detailBoost, edgeBoost, overlayOpacity, silhouetteOffsetX, silhouetteOffsetY, silhouetteScale]);

  React.useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // ------ 创建两个 <video>(只创建一次) ------
  React.useEffect(() => {
    if (!rgbVideoRef.current) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      rgbVideoRef.current = v;
    }
    if (!maskVideoRef.current) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      maskVideoRef.current = v;
    }
    return () => {
      rgbVideoRef.current?.pause();
      maskVideoRef.current?.pause();
    };
  }, []);

  // ------ 换 src 时重新加载 ------
  React.useEffect(() => {
    const rv = rgbVideoRef.current;
    const mv = maskVideoRef.current;
    if (!rv || !mv) return;
    setStatus("loading");
    rv.src = rgbUrl;
    mv.src = maskUrl;
    // 等两个视频都 loadedmetadata 再标记 ready
    let loaded = 0;
    const onReady = () => {
      loaded++;
      if (loaded >= 2) setStatus("ready");
    };
    const onErr = () => setStatus("error");
    rv.addEventListener("loadeddata", onReady, { once: true });
    mv.addEventListener("loadeddata", onReady, { once: true });
    rv.addEventListener("error", onErr, { once: true });
    mv.addEventListener("error", onErr, { once: true });
    rv.load();
    mv.load();
    return () => {
      rv.removeEventListener("loadeddata", onReady);
      mv.removeEventListener("loadeddata", onReady);
      rv.removeEventListener("error", onErr);
      mv.removeEventListener("error", onErr);
    };
  }, [rgbUrl, maskUrl]);

  // ------ Three.js scene/renderer 生命周期 ------
  React.useEffect(() => {
    const mount = mountRef.current;
    const rgbVideo = rgbVideoRef.current;
    const maskVideo = maskVideoRef.current;
    if (!mount || !rgbVideo || !maskVideo) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.transform = userMirror ? "scaleX(-1)" : "";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rgbTex = new THREE.VideoTexture(rgbVideo);
    rgbTex.minFilter = THREE.LinearFilter;
    rgbTex.magFilter = THREE.LinearFilter;
    rgbTex.colorSpace = THREE.SRGBColorSpace;
    const maskTex = new THREE.VideoTexture(maskVideo);
    maskTex.minFilter = THREE.LinearFilter;
    maskTex.magFilter = THREE.LinearFilter;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uRgb: { value: rgbTex },
        uMask: { value: maskTex },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uGlowColor: { value: new THREE.Color(1.0, 0.90, 0.60) },   // 白偏金
        uEdgeColor: { value: new THREE.Color(1.0, 0.82, 0.40) },   // 更亮的金
        uEdgeBoost: { value: 3.4 },
        uDetailBoost: { value: 2.6 },
        uShimmer: { value: 0.0 },
        uShimmerSweep: { value: -1.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);
    const baseScale = { x: 1, y: 1 };

    const applyFit = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w <= 0 || h <= 0) return;
      // 渲染分辨率上限 540p: shader 采样数已降, 但像素数仍是大头
      const maxRenderH = 540;
      const scaleDown = h > maxRenderH ? maxRenderH / h : 1;
      const renderW = Math.round(w * scaleDown);
      const renderH = Math.round(h * scaleDown);
      renderer.setPixelRatio(1);
      renderer.setSize(renderW, renderH, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      // 计算老师视频的 aspect,contain 拟合到 orthographic 的 [-1,1]^2
      const vw = rgbVideo.videoWidth || 1;
      const vh = rgbVideo.videoHeight || 1;
      const rContainer = w / h;
      const rVideo = vw / vh;
      let scaleX = 1, scaleY = 1;
      if (rVideo > rContainer) {
        // 视频更宽,横向填满,纵向留黑边
        scaleY = rContainer / rVideo;
      } else {
        scaleX = rVideo / rContainer;
      }
      baseScale.x = scaleX;
      baseScale.y = scaleY;
      // texel 用于 shader 里模糊步长
      material.uniforms.uTexel.value.set(1 / vw, 1 / vh);
    };
    applyFit();

    const ro = new ResizeObserver(() => applyFit());
    ro.observe(mount);

    rgbVideo.addEventListener("loadedmetadata", applyFit);
    maskVideo.addEventListener("loadedmetadata", applyFit);

    let rafId: number | null = null;
    let disposed = false;
    let lastRenderMs = 0;

    const animate = () => {
      if (disposed) return;
      const now = performance.now();
      if (now - lastRenderMs < 1000 / MATTE_TARGET_FPS) {
        rafId = requestAnimationFrame(animate);
        return;
      }
      lastRenderMs = now;

      material.uniforms.uShimmer.value = 0.0;
      material.uniforms.uShimmerSweep.value = -2.0;
      const visual = visualRef.current;
      mesh.scale.set(baseScale.x * visual.scale, baseScale.y * visual.scale, 1);
      mesh.position.set(visual.offsetX, visual.offsetY, 0);
      material.uniforms.uEdgeBoost.value = visual.edgeBoost;
      material.uniforms.uDetailBoost.value = visual.detailBoost;
      material.uniforms.uOpacity.value = visual.opacity;

      // 播放同步 & seek 同步
      const r = rgbVideoRef.current;
      const m = maskVideoRef.current;
      if (r && m) {
        r.playbackRate = rateRef.current;
        m.playbackRate = rateRef.current;
        if (playingRef.current) {
          if (r.paused) void r.play().catch(() => null);
          if (m.paused) void m.play().catch(() => null);
        } else {
          if (!r.paused) r.pause();
          if (!m.paused) m.pause();
        }
        const seek = seekRef.current;
        if (typeof seek === "number" && Math.abs(r.currentTime - seek) > 0.12) {
          r.currentTime = seek;
          m.currentTime = seek;
        }
        // 纠偏 mask 漂移到 rgb(两个 <video> 自然 drift)
        if (Math.abs(r.currentTime - m.currentTime) > 0.08) {
          m.currentTime = r.currentTime;
        }
        onTimeUpdate?.(r.currentTime);
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      rgbVideo.removeEventListener("loadedmetadata", applyFit);
      maskVideo.removeEventListener("loadedmetadata", applyFit);
      rgbTex.dispose();
      maskTex.dispose();
      material.dispose();
      geo.dispose();
      renderer.dispose();
      try {
        mount.removeChild(renderer.domElement);
      } catch {
        /* already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMirror, bloomStrength, bloomRadius, bloomThreshold]);

  return (
    <div
      ref={mountRef}
      className={className ?? "pointer-events-none absolute inset-0"}
      aria-hidden
    />
  );
}
