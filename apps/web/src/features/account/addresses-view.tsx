"use client";

import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressForm, formatAddress } from "./address-form";
import { displayPhone } from "./mongolia";
import type { Address } from "./addresses-api";
import { useAddresses, useCreateAddress, useDeleteAddress, useUpdateAddress } from "./use-addresses";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";

export function AddressesView() {
  const t = useTranslations("account.addresses");
  const { data: addresses, isPending, error, refetch } = useAddresses();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  if (isPending) {
    return <Skeleton aria-busy aria-label={t("loading")} className="h-40 rounded-[var(--radius-tile)]" />;
  }
  if (error || !addresses) {
    return (
      <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {addresses.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="bg-muted grid size-14 place-items-center rounded-full">
            <MapPin className="text-muted-foreground size-6" />
          </span>
          <div className="space-y-1">
            <h2 className="type-intro font-medium">{t("none")}</h2>
            <p className="text-muted-foreground type-caption">{t("noneHint")}</p>
          </div>
        </div>
      )}

      <ul className="space-y-3" aria-label={t("label")}>
        {addresses.map((address) => (
          <li key={address.id} className="tile p-5 sm:p-6">
            {editing === address.id ? (
              <AddressForm
                initial={address}
                submitLabel={t("saveChanges")}
                onSubmit={async (values) => {
                  await update.mutateAsync({ id: address.id, changes: values });
                  setEditing(null);
                  toast.success(t("updated"));
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 type-caption">
                  <p className="flex items-center gap-2 font-medium">
                    {address.full_name}
                    {address.is_default && (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 type-fine font-medium">
                        {t("default")}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">{formatAddress(address)}</p>
                  {address.phone && <p className="text-muted-foreground tabular-nums">{displayPhone(address.phone)}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!address.is_default && (
                    <Button
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: address.id, changes: { is_default: true } })}
                    >
                      {t("setDefault")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    aria-label={t("editFor", { name: address.full_name, line: address.line1 })}
                    onClick={() => {
                      setAdding(false);
                      setEditing(address.id);
                    }}
                  >
                    <Pencil /> {t("edit")}
                  </Button>
                  <Button
                    variant="outline"
                    aria-label={t("deleteFor", { name: address.full_name, line: address.line1 })}
                    onClick={() => setDeleting(address)}
                  >
                    <Trash2 /> {t("delete")}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding || addresses.length === 0 ? (
        <section aria-labelledby="new-address" className="tile space-y-4 p-5 sm:p-6">
          <h2 id="new-address" className="font-semibold">
            {t("new")}
          </h2>
          <AddressForm
            askDefault={addresses.length > 0}
            onSubmit={async (values) => {
              await create.mutateAsync(values);
              setAdding(false);
              toast.success(t("saved"));
            }}
            onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
          />
        </section>
      ) : (
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
        >
          {t("add")}
        </Button>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {deleting && t("deleteDescription", { name: deleting.full_name, line: deleting.line1 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("keep")}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                await remove.mutateAsync(deleting.id).then(
                  () => toast.success(t("deleted")),
                  () => undefined, // шалтгааныг hook аль хэдийн харуулсан
                );
                setDeleting(null);
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
