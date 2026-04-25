import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          root: "#0B0A14",
          surface: "#17162A",
          raised: "#1E1233",
        },
        brand: {
          DEFAULT: "#A855F7",
          light: "#C084FC",
          dim: "#4A2F5A",
          50: "#FAF5FF",
          100: "#F3E8FF",
          200: "#E9D5FF",
          300: "#D8B4FE",
          400: "#C084FC",
          500: "#A855F7",
          600: "#9333EA",
          700: "#7E22CE",
          800: "#6B21A8",
          900: "#581C87",
        },
        accent: {
          pink: "#EC4899",
          pinkSoft: "#F9A8D4",
        },
        state: {
          success: "#10B981",
          warn: "#F59E0B",
          danger: "#EF4444",
        },
      },
      fontFamily: {
        sans: [
          '"Space Grotesk"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
        display: ['"Bebas Neue"', '"Space Grotesk"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "12px",
      },
      keyframes: {
        "beat-pulse": {
          "0%": { transform: "scale(0.9)", opacity: "0.55" },
          "35%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.08)", opacity: "0.82" },
        },
      },
      animation: {
        "beat-pulse": "beat-pulse 420ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
