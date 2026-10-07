"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchReadiness, type Readiness } from "./api";

const LABELS: Record<Readiness["state"], string> = {
  ready: "API ready",
  degraded: "API degraded",
  unreachable: "API unreachable",
};

const DOT: Record<Readiness["state"], string> = {
  ready: "bg-emerald-500",
  degraded: "bg-amber-500",
  unreachable: "bg-destructive",
};

export function ApiStatus() {
  const { data } = useQuery({
    queryKey: ["health", "readyz"],
    queryFn: ({ signal }) => fetchReadiness(signal),
    refetchInterval: 15_000,
  });

  if (!data) {
    return (
      <span
        className="text-muted-foreground inline-flex items-center gap-2 text-sm"
        role="status"
      >
        <span className="bg-muted-foreground/40 size-2 animate-pulse rounded-full" />
        Checking API…
      </span>
    );
  }

  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-2 text-sm"
      role="status"
      title={
        "checks" in data
          ? Object.entries(data.checks)
              .map(([name, value]) => `${name}: ${value}`)
              .join("\n")
          : undefined
      }
    >
      <span className={`size-2 rounded-full ${DOT[data.state]}`} />
      {LABELS[data.state]}
    </span>
  );
}
