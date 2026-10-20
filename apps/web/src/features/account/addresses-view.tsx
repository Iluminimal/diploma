"use client";

import { MapPin, Pencil, Trash2 } from "lucide-react";
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
import { userMessage } from "@/lib/api/errors";
import { AddressForm, formatAddress } from "./address-form";
import type { Address } from "./addresses-api";
import { useAddresses, useCreateAddress, useDeleteAddress, useUpdateAddress } from "./use-addresses";
import { Skeleton } from "@/components/ui/skeleton";

export function AddressesView() {
  const { data: addresses, isPending, error, refetch } = useAddresses();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  if (isPending) {
    return <Skeleton aria-busy aria-label="Loading your addresses" className="h-40 rounded-2xl" />;
  }
  if (error || !addresses) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {userMessage(error)}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
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
            <h2 className="text-lg font-medium">No saved addresses</h2>
            <p className="text-muted-foreground text-sm">Save one to check out faster.</p>
          </div>
        </div>
      )}

      <ul className="space-y-3" aria-label="Saved addresses">
        {addresses.map((address) => (
          <li key={address.id} className="tile p-5 sm:p-6">
            {editing === address.id ? (
              <AddressForm
                initial={address}
                submitLabel="Save changes"
                onSubmit={async (values) => {
                  await update.mutateAsync({ id: address.id, changes: values });
                  setEditing(null);
                  toast.success("Address updated.");
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    {address.full_name}
                    {address.is_default && (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">{formatAddress(address)}</p>
                  {address.phone && <p className="text-muted-foreground">{address.phone}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!address.is_default && (
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg px-3"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: address.id, changes: { is_default: true } })}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="h-9 rounded-lg px-3"
                    aria-label={`Edit address for ${address.full_name}, ${address.line1}`}
                    onClick={() => {
                      setAdding(false);
                      setEditing(address.id);
                    }}
                  >
                    <Pencil /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-lg px-3"
                    aria-label={`Delete address for ${address.full_name}, ${address.line1}`}
                    onClick={() => setDeleting(address)}
                  >
                    <Trash2 /> Delete
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
            New address
          </h2>
          <AddressForm
            askDefault={addresses.length > 0}
            onSubmit={async (values) => {
              await create.mutateAsync(values);
              setAdding(false);
              toast.success("Address saved.");
            }}
            onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
          />
        </section>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="h-11 rounded-full px-5"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
        >
          Add an address
        </Button>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this address?</DialogTitle>
            <DialogDescription>
              {deleting ? `${deleting.full_name}, ${deleting.line1}. ` : ""}Past orders keep their own copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                await remove.mutateAsync(deleting.id).then(
                  () => toast.success("Address deleted."),
                  () => undefined, // шалтгааныг hook аль хэдийн харуулсан
                );
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
