"use client";

import { useEffect } from "react";
import { bootstrapSession } from "./session";

/** Апп browser дээр анх ачаалахад refresh cookie-оос session-ыг нэг удаа сэргээнэ. */
export function AuthBootstrap() {
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return null;
}
