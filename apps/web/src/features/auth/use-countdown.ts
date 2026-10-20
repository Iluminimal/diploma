"use client";

import { useEffect, useState } from "react";

/** `start()`-ын өгсөн секундээс тэг хүртэл тоолно; дуусахад `remaining` нь 0. */
export function useCountdown() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  return {
    remaining,
    start(seconds: number) {
      const current = Date.now();
      setNow(current);
      setEndsAt(current + seconds * 1000);
    },
  };
}
