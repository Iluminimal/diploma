"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFormat } from "@/i18n/use-format";
import { useUserMessage } from "@/lib/api/use-user-message";
import type { Order } from "@/features/orders/orders-api";
import { cancelOrder, fetchOrder } from "@/features/orders/orders-api";
import { queryKeys } from "@/lib/query-keys";
import { checkPayment, type Charge, type QPayCheckout } from "./checkout-api";
import { formatTimeLeft, useTimeLeft } from "./use-time-left";

/** Хуудас өөрийн API-аас захиалгын төлвийг асуух хугацаа (мс). QPay-руу хандахгүй. */
const ORDER_POLL_MS = 3_000;
/** Төлвийг уншиж чадаагүй (сүлжээ, нэвтрэлт) үед ачааллыг багасгаж удаан асууна. */
const ORDER_POLL_ERROR_MS = 15_000;

/**
 * QPay нэхэмжлэх: компьютер дээр QR-ыг банкны апп-аар уншуулна, утсан дээр банкаа сонгож апп-ыг
 * шууд нээнэ. Төлбөр QPay-ээс мэдэгдлээр ирж, сервер захиалгыг "paid" болгодог. Хуудас нээлттэй
 * байх хугацаанд захиалгын төлвийг манай API-аас 3 секунд тутам уншиж, "paid"
 * болмогц баталгаажуулалтын хуудас руу шилжүүлнэ. Энэ нь QPay-руу хандахгүй (QPay байнга давтан
 * асуухыг хориглодог), зөвхөн өөрсдийн өгөгдлийн сан дахь төлвийг уншдаг. Нууц таб дээр асуулт зогсоно.
 * Мэдэгдэл хоцорсон эсвэл локал орчинд ирэхгүй үед худалдан авагч "Төлбөрөө шалгах"-аар QPay-ээс
 * шууд баталгаажуулна; банкны апп-аас хуудас руу буцаж ирэхэд ч нэг удаа автоматаар шалгана.
 * Нэхэмжлэх хугацаатай: тоолуур харуулж, дуусвал QR-г нууна. Захиалгыг энд цуцалж болно (нөөц шууд буцна).
 */
export function QPayPanel({
  number,
  charge,
  qpay,
  expiresAt,
  onPaid,
  onCancelled,
}: {
  number: string;
  charge: Charge;
  qpay: QPayCheckout;
  /** Нэхэмжлэх хүчинтэй хугацаа дуусах цаг (захиалгаас). */
  expiresAt?: string | null;
  onPaid: (order: Order) => void;
  /** Худалдан авагч захиалгаа цуцалсан: нөөц буцсан. */
  onCancelled: () => void;
}) {
  const t = useTranslations("checkout.qpay");
  const format = useFormat();
  const message = useUserMessage();
  const timeLeft = useTimeLeft(expiresAt);
  const expired = timeLeft === 0;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelOrder(number),
    onSuccess: () => {
      setConfirmingCancel(false);
      onCancelled();
    },
  });
  // Төлбөр хоёр замаар (товч/буцаж ирэх шалгалт ба төлвийн асуулт) нэгэн зэрэг баталгаажиж болох тул
  // `onPaid` зөвхөн нэг удаа дуудагдана.
  const settled = useRef(false);
  const check = useMutation({
    mutationFn: () => checkPayment(number),
    onSuccess: (order) => {
      if (order.status !== "paid" || settled.current) return;
      settled.current = true;
      onPaid(order);
    },
  });
  // Захиалгын төлвийг манай API-аас үе үе уншина. Түлхүүр нь баталгаажуулалтын хуудастай нийтлэг тул
  // хоёр хуудас нэг cache-ийг хуваалцана. `refetchIntervalInBackground` анхдагчаараа false: нууц таб
  // дээр асуухгүй.
  const watch = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => fetchOrder(number),
    refetchInterval: (query) => {
      if (query.state.status === "error") return ORDER_POLL_ERROR_MS;
      return query.state.data && query.state.data.status !== "pending" ? false : ORDER_POLL_MS;
    },
  });
  const paidOrder = watch.data?.status === "paid" ? watch.data : null;
  useEffect(() => {
    if (!paidOrder || settled.current) return;
    settled.current = true;
    onPaid(paidOrder);
  }, [paidOrder, onPaid]);
  // TanStack-ийн `mutate` render бүрд ижил тул listener нэг л удаа бүртгэгдэнэ.
  const { mutate } = check;

  useEffect(() => {
    function onReturn() {
      if (document.visibilityState === "visible") mutate();
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [mutate]);

  const status = check.data?.status;
  // Захиалгыг өөр газраас (админ, хугацаа дуусгагч) цуцалсан бол QR-аар төлөх боломжгүй.
  const cancelled = status === "cancelled" || watch.data?.status === "cancelled";
  const closed = expired || cancelled;
  return (
    <section aria-labelledby="qpay-title" className="tile mx-auto max-w-xl space-y-6 p-6 text-center sm:p-10">
      <header className="space-y-2">
        <p className="text-muted-foreground type-caption">{t("panel.order", { number })}</p>
        <h2 id="qpay-title" className="type-title">
          {t("panel.title")}
        </h2>
        <p className="text-muted-foreground type-caption">{t("panel.lead")}</p>
      </header>

      <div className="space-y-1">
        <p className="text-muted-foreground type-fine tracking-wide uppercase">{t("panel.amount")}</p>
        <p className="type-title font-semibold tabular-nums">{format.price(charge.amount_minor, charge.currency)}</p>
        {timeLeft !== null && !closed && (
          <p className="text-muted-foreground type-caption tabular-nums">{t("panel.validFor", { time: formatTimeLeft(timeLeft) })}</p>
        )}
      </div>

      {closed && (
        <div role="alert" className="bg-secondary/60 space-y-3 rounded-2xl p-4">
          {expired ? (
            <>
              <p className="font-medium">{t("panel.expiredTitle")}</p>
              <p className="text-muted-foreground type-caption">{t("panel.expiredBody")}</p>
            </>
          ) : (
            <p className="font-medium">{t("panel.expired")}</p>
          )}
          <Button asChild size="lg">
            <Link href="/checkout">{t("panel.restart")}</Link>
          </Button>
        </div>
      )}

      {closed ? null : qpay.qr_image ? (
        // eslint-disable-next-line @next/next/no-img-element -- QPay-ийн өгсөн base64 PNG, optimize хийх зүйлгүй
        <img
          src={`data:image/png;base64,${qpay.qr_image}`}
          alt={t("panel.qrAlt", { number })}
          width={240}
          height={240}
          className="mx-auto size-60 rounded-2xl bg-white p-3"
        />
      ) : (
        <QrCode aria-hidden className="text-muted-foreground mx-auto size-24" />
      )}

      {!closed && qpay.banks.length > 0 && (
        <div className="space-y-3 sm:hidden">
          <p className="type-caption font-medium">{t("panel.banks")}</p>
          <ul className="grid grid-cols-3 gap-2">
            {qpay.banks.map((bank) => (
              <li key={bank.link}>
                <a
                  href={bank.link}
                  className="bg-secondary hover:bg-muted flex h-full flex-col items-center gap-1.5 rounded-xl p-2 type-fine"
                >
                  {bank.logo && (
                    // eslint-disable-next-line @next/next/no-img-element -- банкны лого QPay-ийн CDN-ээс
                    <img src={bank.logo} alt="" width={40} height={40} className="size-10 rounded-lg" />
                  )}
                  <span className="line-clamp-2">{bank.description || bank.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <Button size="xl" className="w-full" disabled={check.isPending} onClick={() => mutate()}>
          {check.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {check.isPending ? t("panel.checking") : t("panel.check")}
        </Button>
        {!closed && qpay.short_url && (
          <Button asChild variant="bordered" size="lg" className="w-full">
            <a href={qpay.short_url} target="_blank" rel="noreferrer">
              {t("panel.openQPay")}
            </a>
          </Button>
        )}
        <p role="status" aria-live="polite" className="min-h-5 type-caption">
          {check.error ? (
            <span className="text-destructive">{message(check.error)}</span>
          ) : status === "pending" ? (
            <span className="text-muted-foreground">{t("panel.notYet")}</span>
          ) : null}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground type-fine">{t("note")}</p>
        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => setConfirmingCancel(true)}>
          {t("panel.cancel")}
        </Button>
      </div>

      <Dialog open={confirmingCancel} onOpenChange={(open) => !cancel.isPending && setConfirmingCancel(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("panel.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("panel.cancelBody")}</DialogDescription>
          </DialogHeader>
          {cancel.error && (
            <p role="alert" className="text-destructive type-caption">
              {message(cancel.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={cancel.isPending} onClick={() => setConfirmingCancel(false)}>
              {t("panel.keep")}
            </Button>
            <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending && <Loader2 className="animate-spin" />} {t("panel.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
