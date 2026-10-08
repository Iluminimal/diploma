import { cn } from "@/lib/utils";
import type { Order } from "./orders-api";

const LABELS: Record<Order["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-success/15 text-success" },
  pending: { label: "Awaiting payment", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status }: { status: Order["status"] }) {
  const { label, className } = LABELS[status];
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", className)}>{label}</span>;
}
