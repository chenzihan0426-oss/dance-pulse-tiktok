"use client";

import * as React from "react";

/** 来自 logo.html 的 DP SVG，尺寸由 className 控制 */
export function DancePulseLogo({
  className = "h-10 w-10",
  title = "DancePulse",
}: {
  className?: string;
  title?: string;
}) {
  const uid = React.useId().replace(/:/g, "");
  const gradD = `gradD-${uid}`;
  const gradP = `gradP-${uid}`;
  const neon = `neonGlow-${uid}`;

  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      style={{ filter: "drop-shadow(0 0 10px rgba(255,42,122,0.35))" }}
    >
      <defs>
        <linearGradient id={gradD} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F0FF" />
          <stop offset="100%" stopColor="#9D4EDD" />
        </linearGradient>
        <linearGradient id={gradP} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF2A7A" />
          <stop offset="100%" stopColor="#9D4EDD" />
        </linearGradient>
        <filter id={neon} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g opacity="0.8">
        <rect
          x="25"
          y="100"
          width="20"
          height="5"
          fill="#00F0FF"
          transform="rotate(-15, 25, 100)"
          filter={`url(#${neon})`}
        />
        <rect
          x="40"
          y="85"
          width="12"
          height="4"
          fill="#FF2A7A"
          transform="rotate(-15, 40, 85)"
          filter={`url(#${neon})`}
        />
        <rect
          x="180"
          y="160"
          width="28"
          height="6"
          fill="#FF2A7A"
          transform="rotate(-15, 180, 160)"
          filter={`url(#${neon})`}
        />
        <rect
          x="195"
          y="175"
          width="16"
          height="4"
          fill="#00F0FF"
          transform="rotate(-15, 195, 175)"
          filter={`url(#${neon})`}
        />
      </g>

      <text
        x="95"
        y="150"
        fontFamily="'Orbitron', sans-serif"
        fontSize="130"
        fontStyle="italic"
        fontWeight="900"
        fill="none"
        stroke="#00F0FF"
        strokeWidth="2"
        textAnchor="middle"
        transform="rotate(-8, 95, 150) translate(-8, -6)"
        opacity="0.5"
      >
        D
      </text>
      <text
        x="95"
        y="150"
        fontFamily="'Orbitron', sans-serif"
        fontSize="130"
        fontStyle="italic"
        fontWeight="900"
        fill={`url(#${gradD})`}
        textAnchor="middle"
        filter={`url(#${neon})`}
        transform="rotate(-8, 95, 150)"
      >
        D
      </text>

      <text
        x="155"
        y="165"
        fontFamily="'Orbitron', sans-serif"
        fontSize="130"
        fontStyle="italic"
        fontWeight="900"
        fill="none"
        stroke="#FF2A7A"
        strokeWidth="2"
        textAnchor="middle"
        transform="rotate(6, 155, 165) translate(8, -6)"
        opacity="0.5"
      >
        P
      </text>
      <text
        x="155"
        y="165"
        fontFamily="'Orbitron', sans-serif"
        fontSize="130"
        fontStyle="italic"
        fontWeight="900"
        fill={`url(#${gradP})`}
        textAnchor="middle"
        filter={`url(#${neon})`}
        transform="rotate(6, 155, 165)"
      >
        P
      </text>
    </svg>
  );
}
