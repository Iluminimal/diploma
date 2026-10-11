import "server-only";
import { cache } from "react";
import { createApiClient } from "@/lib/api/client";

/**
 * Which extra ways of signing in the API offers. Any failure means "none": a login page that
 * cannot ask the API still has to show the password form.
 */
export const getAuthProviders = cache(async (): Promise<{ google: boolean }> => {
  try {
    const { data } = await createApiClient(60).GET("/api/v1/auth/providers");
    return { google: data?.google === true };
  } catch {
    return { google: false };
  }
});
