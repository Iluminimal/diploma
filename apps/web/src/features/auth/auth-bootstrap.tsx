"use client";

import { useEffect } from "react";
import { bootstrapSession } from "./session";

/** Restores the session from the refresh cookie once, when the app first loads in the browser. */
export function AuthBootstrap() {
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return null;
}
