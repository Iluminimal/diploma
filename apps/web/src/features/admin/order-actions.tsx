"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CheckCheck, RotateCcw, Truck } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminOrder } from "./admin-api";
import { useCancelOrder, useDeliverOrder, useRefundOrder, useShipOrder } from "./use-admin";

const CARRIERS = ["DHL", "UPS", "FedEx", "USPS", "Royal Mail"];

type Action = "ship" | "deliver" | "cancel" | "refund" | null;

/** What can be done to an order in its current state (the API refuses anything else). */
export function availableActions(status: AdminOrder["status"]) {
  return {
    ship: status === "paid",
    deliver: status === "shipped",
    cancel: status === "pending",
    refund: status === "paid" || status === "shipped" || status === "delivered",
  };
}

export function OrderActions({ order }: { order: AdminOrder }) {
  const [open, setOpen] = useState<Action>(null);
  const can = availableActions(order.status);
  if (!can.ship && !can.deliver && !can.cancel && !can.refund) return null;
  const close = () => setOpen(null);

  return (
    <>
      {can.ship && (
        <Button className="h-10 rounded-full px-4" onClick={() => setOpen("ship")}>
          <Truck aria-hidden /> Mark as shipped
        </Button>
      )}
      {can.deliver && (
        <Button className="h-10 rounded-full px-4" onClick={() => setOpen("deliver")}>
          <CheckCheck aria-hidden /> Mark as delivered
        </Button>
      )}
      {can.refund && (
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen("refund")}>
          <RotateCcw aria-hidden /> Refund
        </Button>
      )}
      {can.cancel && (
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen("cancel")}>
          <Ban aria-hidden /> Cancel order
        </Button>
      )}
      <ShipDialog order={order} open={open === "ship"} onClose={close} />
      <DeliverDialog order={order} open={open === "deliver"} onClose={close} />
      <CancelDialog order={order} open={open === "cancel"} onClose={close} />
      <RefundDialog order={order} open={open === "refund"} onClose={close} />
    </>
  );
}

type DialogProps = { order: AdminOrder; open: boolean; onClose: () => void };

const shipSchema = z.object({
  carrier: z.string().trim().min(1, "Enter the carrier").max(40, "Use at most 40 characters"),
  tracking_number: z.string().trim().min(1, "Enter the tracking number").max(100, "Use at most 100 characters"),
});
type ShipValues = z.infer<typeof shipSchema>;

function ShipDialog({ order, open, onClose }: DialogProps) {
  const ship = useShipOrder();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ShipValues>({ resolver: zodResolver(shipSchema), defaultValues: { carrier: "", tracking_number: "" } });

  const submit = handleSubmit((values) =>
    ship.mutate(
      { number: order.number, ...values },
      {
        onSuccess: () => {
          toast.success(`Order ${order.number} is marked as shipped. The customer has been emailed.`);
          reset();
          onClose();
        },
      },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Mark as shipped</DialogTitle>
            <DialogDescription>
              Order {order.number}. The customer is emailed the tracking number and sees it on their order.
            </DialogDescription>
          </DialogHeader>
          <Field id="carrier" label="Carrier" error={errors.carrier?.message}>
            <Input
              {...fieldAria("carrier", errors.carrier?.message)}
              list="carriers"
              autoComplete="off"
              className="h-11 rounded-xl"
              {...register("carrier")}
            />
            <datalist id="carriers">
              {CARRIERS.map((carrier) => (
                <option key={carrier} value={carrier} />
              ))}
            </datalist>
          </Field>
          <Field id="tracking_number" label="Tracking number" error={errors.tracking_number?.message}>
            <Input
              {...fieldAria("tracking_number", errors.tracking_number?.message)}
              autoComplete="off"
              className="h-11 rounded-xl"
              {...register("tracking_number")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" disabled={ship.isPending}>
              {ship.isPending ? "Saving…" : "Mark as shipped"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({ order, open, onClose }: DialogProps) {
  const deliver = useDeliverOrder();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as delivered?</DialogTitle>
          <DialogDescription>
            Order {order.number} arrived. The customer is emailed, and can then review what they bought.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
          <Button
            disabled={deliver.isPending}
            onClick={() =>
              deliver.mutate(order.number, {
                onSuccess: () => {
                  toast.success(`Order ${order.number} is marked as delivered.`);
                  onClose();
                },
              })
            }
          >
            {deliver.isPending ? "Saving…" : "Mark as delivered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ order, open, onClose }: DialogProps) {
  const cancel = useCancelOrder();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>
            Order {order.number} has not been paid. The items go back in stock and the payment is cancelled, so it can no
            longer be paid. The customer is emailed.
          </DialogDescription>
        </DialogHeader>
        <Field id="cancel-reason" label="Note (optional)" hint="Kept in the order's history, not shown to the customer.">
          <Textarea
            id="cancel-reason"
            aria-describedby="cancel-reason-hint"
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep the order
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { number: order.number, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(`Order ${order.number} is cancelled.`);
                    setReason("");
                    onClose();
                  },
                },
              )
            }
          >
            {cancel.isPending ? "Cancelling…" : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const refundSchema = z.object({
  reason: z.string().trim().min(1, "Say why it is being refunded").max(300, "Use at most 300 characters"),
  restock: z.boolean(),
});
type RefundValues = z.infer<typeof refundSchema>;

function RefundDialog({ order, open, onClose }: DialogProps) {
  const refund = useRefundOrder();
  const amount = order.payment?.amount_cents ?? order.total_cents;
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<RefundValues>({
    resolver: zodResolver(refundSchema),
    // Something that has not left the warehouse is back on the shelf; what was posted may not be.
    defaultValues: { reason: "", restock: order.status === "paid" },
  });
  const restock = useWatch({ control, name: "restock" });

  const submit = handleSubmit((values) =>
    refund.mutate(
      { number: order.number, ...values },
      {
        onSuccess: () => {
          toast.success(`Order ${order.number} is refunded. The customer has been emailed.`);
          reset();
          onClose();
        },
      },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Refund this order?</DialogTitle>
            <DialogDescription>
              The customer gets all of{" "}
              <Price cents={amount} currency={order.currency} className="text-foreground font-medium" /> back, shipping
              included. A refund cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Field id="refund-reason" label="Reason" error={errors.reason?.message} hint="Kept in the order's history.">
            <Textarea {...fieldAria("refund-reason", errors.reason?.message, "Kept in the order's history.")} maxLength={300} {...register("reason")} />
          </Field>
          <div className="flex items-start gap-3">
            <Checkbox
              id="restock"
              checked={restock}
              onCheckedChange={(checked) => setValue("restock", checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="restock">Put the items back in stock</Label>
              <p className="text-muted-foreground text-xs">Leave this off for goods that were lost or damaged.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep the order
            </Button>
            <Button type="submit" variant="destructive" disabled={refund.isPending}>
              {refund.isPending ? "Refunding…" : "Refund order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
