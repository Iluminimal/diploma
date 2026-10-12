/** "Oct 8, 2026, 10:00 AM" in the administrator's own time zone. */
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** "Oct 8, 2026". */
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
