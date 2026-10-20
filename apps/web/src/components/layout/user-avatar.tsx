"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  user: { full_name: string; avatar_url: string | null };
  /** Дөрвөлжин хэмжээ, пикселээр. */
  size?: number;
  className?: string;
};

/** "Ada Lovelace" -> "AL", "ada" -> "A". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]!][0]!;
  const last = words.length > 1 ? [...words[words.length - 1]!][0]! : "";
  return (first + last).toUpperCase();
}

/**
 * Хүний зураг (Google-ээр нэвтэрсэн бол Google-ийнх) эсвэл нэрийн эхний үсгүүд. Чимэглэл: нэр нь
 * үргэлж хажууд бичигдсэн эсвэл тойрсон товчны label байна.
 */
export function UserAvatar({ user, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (user.avatar_url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- гуравдагч этгээдийн хэмжээ тодорхойгүй зураг; image loader нь каталогийн зурагт зориулагдсан
      <img
        src={user.avatar_url}
        alt=""
        width={size}
        height={size}
        style={style}
        // Google-ийн серверт энэ дэлгүүр аль нь гэдгийг хэлэх шаардлагагүй.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "bg-foreground text-background inline-grid shrink-0 place-items-center rounded-full font-medium tracking-tight select-none",
        className,
      )}
    >
      {initials(user.full_name)}
    </span>
  );
}
