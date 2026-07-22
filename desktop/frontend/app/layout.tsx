import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DancePulse · 舞拍",
  description: "K-pop 编舞视频自动拆片、确认切片与卡片化学习",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DancePulse",
  },
};

export const viewport: Viewport = {
  themeColor: "#a855f7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Michroma&family=Noto+Sans+SC:wght@400;700;900&family=Orbitron:wght@900&display=swap"
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
        />
      </head>
      <body className="min-h-screen bg-bg-root text-[var(--fg)] antialiased">{children}</body>
    </html>
  );
}
