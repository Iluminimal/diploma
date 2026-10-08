import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:8000"),
  // Empty in offline payment mode: checkout then shows a "simulate payment" button.
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

// Next.js only inlines NEXT_PUBLIC_* variables referenced statically, so each
// one must be listed here explicitly rather than passing `process.env` whole.
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || undefined,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
});
