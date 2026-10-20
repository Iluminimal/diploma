/** Админы өөрийн цагийн бүс дэх "Oct 8, 2026, 10:00 AM" хэлбэр. */
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** "Oct 8, 2026" хэлбэр. */
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
