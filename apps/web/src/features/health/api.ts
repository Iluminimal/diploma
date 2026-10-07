import { z } from "zod";
import { env } from "@/lib/env";

const checkValue = z.enum(["ok", "fail", "not_configured"]);

// Both the 200 body and the 503 problem+json body carry `checks`.
const readinessBody = z.object({
  checks: z.record(z.string(), checkValue),
});

export type CheckValue = z.infer<typeof checkValue>;

export type Readiness =
  | { state: "ready"; checks: Record<string, CheckValue> }
  | { state: "degraded"; checks: Record<string, CheckValue> }
  | { state: "unreachable" };

export async function fetchReadiness(signal?: AbortSignal): Promise<Readiness> {
  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_API_URL}/readyz`, {
      signal: signal ?? AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    return { state: "unreachable" };
  }

  const parsed = readinessBody.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { state: "unreachable" };

  return {
    state: response.ok ? "ready" : "degraded",
    checks: parsed.data.checks,
  };
}
