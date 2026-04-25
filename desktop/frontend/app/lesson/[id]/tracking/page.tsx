"use client";

// PC 端这条路由: 直接 302 到 tracking-desktop (PC 专用的左右分栏布局)

import * as React from "react";
import { useParams, useRouter } from "next/navigation";

export default function TrackingRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  React.useEffect(() => {
    if (params?.id) router.replace(`/lesson/${params.id}/tracking-desktop`);
  }, [params, router]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white/50">
      转到 PC 跟拍挑战...
    </main>
  );
}
