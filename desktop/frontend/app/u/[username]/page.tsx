"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ProfileArenaPage } from "@/components/profile/ProfileArenaPage";
import { getProfilePageModel } from "@/lib/communityShowcase";
import { useCommunityProfile } from "@/lib/useCommunityFeed";
import { useAuth } from "@/hooks/useAuth";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? "";
  const { user } = useAuth();
  const { data, loading, error, follow } = useCommunityProfile(username);
  const model = React.useMemo(() => getProfilePageModel(username), [username]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[1100px] items-center justify-center px-10 text-white/45">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  if (error || !data || !model) {
    return (
      <main className="mx-auto min-h-screen max-w-[1100px] px-10 py-12 text-white">
        <div className="border border-[#ff0055]/30 bg-[#ff0055]/10 px-4 py-5 text-sm text-red-200">
          {error ?? "主页加载失败"}
        </div>
      </main>
    );
  }

  // 用 hook 里的关注态覆盖模型
  const liveModel = {
    ...model,
    user: {
      ...model.user,
      isFollowing: data.user.isFollowing,
      stats: data.user.stats,
    },
    works: data.results.length ? data.results : model.works,
  };

  return (
    <ProfileArenaPage
      model={liveModel}
      isOwn={user?.username === data.user.username}
      following={data.user.isFollowing}
      onFollow={() => void follow()}
      backHref="/community"
    />
  );
}
