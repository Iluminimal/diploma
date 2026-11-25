"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CheckCheck, RotateCcw, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import "@/lib/zod-jitless";
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
import { useAuth } from "@/features/auth/auth-store";
import { useFieldError } from "@/i18n/use-field-error";
import type { AdminOrder } from "./admin-api";
import { useCancelOrder, useDeliverOrder, useRefundOrder, useShipOrder } from "./use-admin";

// Захиалга ихэвчлэн Монгол доторх тээврээр явдаг: Улаанбаатарт өөрийн хүргэлт, аймагт шуудан.
const CARRIERS = ["Монгол шуудан", "Өөрийн хүргэлт"];

type Action = "ship" | "deliver" | "cancel" | "refund" | null;

/**
 * Захиалгад одоогийн төлвөөр нь, мөн хэрэглэгчийн role-оор юу хийж болох вэ (өөрийг нь API татгалзана):
 * илгээх, хүргэх нь агуулахын ажилтных; цуцлах, буцаах нь админых.
 */
export function availableActions(status: AdminOrder["status"], role: string | undefined) {
  const warehouse = role === "warehouse";
  const admin = role === "admin";
  return {
    ship: warehouse && status === "paid",
    deliver: warehouse && status === "shipped",
    cancel: admin && status === "pending",
    refund: admin && (status === "paid" || status === "shipped" || status === "delivered"),
  };
}

export function OrderActions({ order }: { order: AdminOrder }) {
  const t = useTranslations("admin.actions");
  const [open, setOpen] = useState<Action>(null);
  // Диалог нээгдэх бүрд шинэ төлөвтэй: өмнөх удаагийн бичсэн шалтгаан, "буцаан нөөцлөх"-ийн сонголт
  // (захиалгын одоогийн төлвөөс гарсан өгөгдмөл) үлдэхгүй.
  const [session, setSession] = useState(0);
  const role = useAuth((state) => state.user?.role);
  const can = availableActions(order.status, role);
  if (!can.ship && !can.deliver && !can.cancel && !can.refund) return null;
  const close = () => setOpen(null);
  const show = (action: Exclude<Action, null>) => {
    setSession((count) => count + 1);
    setOpen(action);
  };

  return (
    <>
      {can.ship && (
        <Button onClick={() => show("ship")}>
          <Truck aria-hidden /> {t("markShipped")}
        </Button>
      )}
      {can.deliver && (
        <Button onClick={() => show("deliver")}>
          <CheckCheck aria-hidden /> {t("markDelivered")}
        </Button>
      )}
      {can.refund && (
        <Button variant="outline" onClick={() => show("refund")}>
          <RotateCcw aria-hidden /> {t("refund")}
        </Button>
      )}
      {can.cancel && (
        <Button variant="outline" onClick={() => show("cancel")}>
          <Ban aria-hidden /> {t("cancelOrder")}
        </Button>
      )}
      <ShipDialog key={`ship-${session}`} order={order} open={open === "ship"} onClose={close} />
      <DeliverDialog key={`deliver-${session}`} order={order} open={open === "deliver"} onClose={close} />
      <CancelDialog key={`cancel-${session}`} order={order} open={open === "cancel"} onClose={close} />
      <RefundDialog key={`refund-${session}`} order={order} open={open === "refund"} onClose={close} />
    </>
  );
}

type DialogProps = { order: AdminOrder; open: boolean; onClose: () => void };

const shipSchema = z.object({
  carrier: z.string().trim().min(1, "adminCarrier").max(40, "adminMax40"),
  tracking_number: z.string().trim().min(1, "adminTracking").max(100, "adminMax100"),
});
type ShipValues = z.infer<typeof shipSchema>;

function ShipDialog({ order, open, onClose }: DialogProps) {
  const t = useTranslations("admin.actions");
  const fieldError = useFieldError();
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
          toast.success(t("shippedToast", { number: order.number }));
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
            <DialogTitle>{t("markShipped")}</DialogTitle>
            <DialogDescription>{t("shipDesc", { number: order.number })}</DialogDescription>
          </DialogHeader>
          <Field id="carrier" label={t("carrier")} error={fieldError(errors.carrier?.message)}>
            <Input
              {...fieldAria("carrier", errors.carrier?.message)}
              list="carriers"
              autoComplete="off"
              {...register("carrier")}
            />
            <datalist id="carriers">
              {CARRIERS.map((carrier) => (
                <option key={carrier} value={carrier} />
              ))}
            </datalist>
          </Field>
          <Field id="tracking_number" label={t("tracking")} error={fieldError(errors.tracking_number?.message)}>
            <Input
              {...fieldAria("tracking_number", errors.tracking_number?.message)}
              autoComplete="off"
              {...register("tracking_number")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("notYet")}
            </Button>
            <Button type="submit" disabled={ship.isPending}>
              {ship.isPending ? t("saving") : t("markShipped")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({ order, open, onClose }: DialogProps) {
  const t = useTranslations("admin.actions");
  const deliver = useDeliverOrder();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deliverTitle")}</DialogTitle>
          <DialogDescription>{t("deliverDesc", { number: order.number })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("notYet")}
          </Button>
          <Button
            disabled={deliver.isPending}
            onClick={() =>
              deliver.mutate(order.number, {
                onSuccess: () => {
                  toast.success(t("deliveredToast", { number: order.number }));
                  onClose();
                },
              })
            }
          >
            {deliver.isPending ? t("saving") : t("markDelivered")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ order, open, onClose }: DialogProps) {
  const t = useTranslations("admin.actions");
  const cancel = useCancelOrder();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancelTitle")}</DialogTitle>
          <DialogDescription>{t("cancelDesc", { number: order.number })}</DialogDescription>
        </DialogHeader>
        <Field id="cancel-reason" label={t("noteOptional")} hint={t("noteHint")}>
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
            {t("keepOrder")}
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { number: order.number, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(t("cancelledToast", { number: order.number }));
                    setReason("");
                    onClose();
                  },
                },
              )
            }
          >
            {cancel.isPending ? t("cancelling") : t("cancelOrder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const refundSchema = z.object({
  reason: z.string().trim().min(1, "adminRefundReason").max(300, "adminMax300"),
  restock: z.boolean(),
});
type RefundValues = z.infer<typeof refundSchema>;

function RefundDialog({ order, open, onClose }: DialogProps) {
  const t = useTranslations("admin.actions");
  const fieldError = useFieldError();
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
    // Агуулахаас гараагүй бараа тавиур руу буцна; илгээсэн нь буцахгүй байж болно.
    defaultValues: { reason: "", restock: order.status === "paid" },
  });
  const restock = useWatch({ control, name: "restock" });

  const submit = handleSubmit((values) =>
    refund.mutate(
      { number: order.number, ...values },
      {
        onSuccess: () => {
          toast.success(t("refundedToast", { number: order.number }));
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
            <DialogTitle>{t("refundTitle")}</DialogTitle>
            <DialogDescription>
              {t("refundDescPre")}{" "}
              <Price cents={amount} currency={order.currency} className="text-foreground font-medium" />{" "}
              {t("refundDescPost")}
            </DialogDescription>
          </DialogHeader>
          <Field id="refund-reason" label={t("reason")} error={fieldError(errors.reason?.message)} hint={t("reasonHint")}>
            <Textarea {...fieldAria("refund-reason", errors.reason?.message, t("reasonHint"))} maxLength={300} {...register("reason")} />
          </Field>
          <div className="flex items-start gap-3">
            <Checkbox
              id="restock"
              checked={restock}
              onCheckedChange={(checked) => setValue("restock", checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="restock">{t("restock")}</Label>
              <p className="text-muted-foreground text-xs">{t("restockHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("keepOrder")}
            </Button>
            <Button type="submit" variant="destructive" disabled={refund.isPending}>
              {refund.isPending ? t("refunding") : t("refundOrder")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
