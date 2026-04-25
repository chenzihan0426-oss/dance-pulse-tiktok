import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import type { CommunityFeedItem } from "@/lib/types";

export function CommunityResultCard({
  item,
  href,
}: {
  item: CommunityFeedItem;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-[26px] border border-white/8 bg-bg-surface transition hover:border-white/14 hover:bg-white/[0.04]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        {item.previewThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.previewThumbnail}
            alt={item.lessonTitle}
            className="h-full w-full object-cover opacity-80"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,10,18,0.02)_0%,rgba(12,10,18,0.25)_36%,rgba(12,10,18,0.88)_100%)]" />

        <div className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-[12px] font-semibold text-white">
          {item.result.score} 分
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-[12px] text-white/65">@{item.user.username}</div>
          <div className="mt-1 text-[18px] font-semibold tracking-tight text-white">
            {item.user.displayName}
          </div>
          <div className="mt-1 line-clamp-1 text-[13px] text-white/55">{item.lessonTitle}</div>

          <div className="mt-3 flex items-center gap-4 text-[12px] text-white/58">
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" />
              {item.result.likeCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              {item.result.commentCount}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
