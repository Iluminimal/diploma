import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:8000"),
});

// Next.js only inlines NEXT_PUBLIC_* variables referenced statically, so each
// one must be listed here explicitly rather than passing `process.env` whole.
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
});
