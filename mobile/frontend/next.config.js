const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

const backendOrigin = (process.env.DANCEPULSE_BACKEND_ORIGIN || "").replace(/\/$/, "");
const backendProxyRoutes = [
  "/health",
  "/api/:path*",
  "/videos/:path*",
  "/clips/:path*",
  "/thumbs/:path*",
  "/pose/:path*",
  "/matte/:path*",
  "/pose_full/:path*",
  "/particles/:path*",
  "/tracking-videos/:path*",
];

module.exports = (phase) => ({
  reactStrictMode: true,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  async rewrites() {
    if (!backendOrigin) return [];
    return backendProxyRoutes.map((source) => ({
      source,
      destination: `${backendOrigin}${source}`,
    }));
  },
});
