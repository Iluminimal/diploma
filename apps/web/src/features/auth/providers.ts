import "server-only";
import { cache } from "react";
import { createApiClient } from "@/lib/api/client";

/**
 * API нэвтрэх ямар нэмэлт арга санал болгодог вэ. Алдаа бүрийг "байхгүй" гэж үзнэ: API-аас асууж
 * чадахгүй login хуудас ч нууц үгийн form-ыг заавал харуулах ёстой.
 */
export const getAuthProviders = cache(async (): Promise<{ google: boolean }> => {
  try {
    const { data } = await createApiClient(60).GET("/api/v1/auth/providers");
    return { google: data?.google === true };
  } catch {
    return { google: false };
  }
});
