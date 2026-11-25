"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBagPanel } from "@/features/cart/cart-ui-store";
import { useIsStaff } from "@/features/auth/use-role";
import { useUserMessage } from "@/lib/api/use-user-message";
import { queryKeys } from "@/lib/query-keys";
import { reorderOrder } from "./orders-api";

/**
 * "Дахин захиалах": захиалгын бараануудыг сагсанд буцааж, bag panel-ийг нээнэ. Нэмэгдээгүй эсвэл
 * цөөрсөн бараа бүрийг шалтгаантай нь мэдэгдэнэ. Ажилтанд (худалдан авалт хийхгүй) харагдахгүй.
 */
export function ReorderButton({ number }: { number: string }) {
  const t = useTranslations("orders.page");
  const userMessage = useUserMessage();
  const queryClient = useQueryClient();
  const openBag = useBagPanel((state) => state.setOpen);
  const isStaff = useIsStaff();
  const reorder = useMutation({
    mutationFn: () => reorderOrder(number),
    onError: (error) => toast.error(userMessage(error)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      for (const line of result.skipped) {
        toast(t(`reorderSkipped.${line.reason}`, { name: line.name }));
      }
      if (result.added === 0) {
        toast.error(t("reorderNothing"));
        return;
      }
      toast.success(t("reordered", { count: result.added }));
      openBag(true);
    },
  });
  if (isStaff) return null;
  return (
    <Button type="button" variant="outline" onClick={() => reorder.mutate()} disabled={reorder.isPending}>
      {reorder.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
      {reorder.isPending ? t("reordering") : t("reorder")}
    </Button>
  );
}
