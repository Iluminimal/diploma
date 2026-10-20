"use client";

import { Laptop, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { userMessage } from "@/lib/api/errors";
import { useRevokeOtherSessions, useRevokeSession, useSessions } from "./use-contact";

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/**
 * Бүртгэлд нэвтэрсэн төхөөрөмжүүд; аль нэгийг нь (эсвэл одоогийнхоос бусад бүгдийг) гаргах
 * боломжтой.
 */
export function DevicesCard() {
  const sessions = useSessions(true);
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const list = sessions.data ?? [];
  const others = list.filter((session) => !session.current).length;

  return (
    <section className="tile space-y-5 p-6 sm:p-8">
      <header className="space-y-1">
        <h2 className="type-heading">Your devices</h2>
        <p className="text-muted-foreground text-sm">Where you&apos;re signed in. Sign out any you don&apos;t recognise.</p>
      </header>
      {sessions.isPending ? (
        <Skeleton aria-busy aria-label="Loading your devices" className="h-24 rounded-2xl" />
      ) : sessions.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {userMessage(sessions.error)}
        </p>
      ) : (
        <ul aria-label="Devices" className="divide-border divide-y">
          {list.map((session) => {
            const Icon = /iPhone|iPad|Android/.test(session.device) ? Smartphone : Laptop;
            return (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <Icon aria-hidden className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {session.device}
                      {session.current && (
                        <span className="bg-secondary text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-xs font-normal">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Active {when.format(new Date(session.last_used_at))}
                      {session.ip ? ` · ${session.ip}` : ""}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="outline"
                    className="h-9 rounded-full px-4"
                    disabled={revoke.isPending}
                    aria-label={`Sign out ${session.device}`}
                    onClick={() =>
                      revoke.mutate(
                        { id: session.id, current: session.current },
                        {
                          onSuccess: () => toast.success("Signed out."),
                          onError: (error) => toast.error(userMessage(error)),
                        },
                      )
                    }
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {others > 0 && (
        <Button
          variant="outline"
          className="h-10 rounded-full px-4"
          disabled={revokeOthers.isPending}
          onClick={() =>
            revokeOthers.mutate(undefined, {
              onSuccess: () => toast.success("Signed out everywhere else."),
              onError: (error) => toast.error(userMessage(error)),
            })
          }
        >
          {revokeOthers.isPending && <Loader2 className="animate-spin" />} Sign out everywhere else
        </Button>
      )}
    </section>
  );
}
