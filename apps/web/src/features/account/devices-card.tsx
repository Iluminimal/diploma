"use client";

import { Laptop, Loader2, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/i18n/use-format";
import { useUserMessage } from "@/lib/api/use-user-message";
import { useRevokeOtherSessions, useRevokeSession, useSessions } from "./use-contact";

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * Бүртгэлд нэвтэрсэн төхөөрөмжүүд; аль нэгийг нь (эсвэл одоогийнхоос бусад бүгдийг) гаргах
 * боломжтой.
 */
export function DevicesCard() {
  const t = useTranslations("account.devices");
  const format = useFormat();
  const userMessage = useUserMessage();
  const sessions = useSessions(true);
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const list = sessions.data ?? [];
  const others = list.filter((session) => !session.current).length;

  return (
    <section className="tile space-y-5 p-6 sm:p-8">
      <header className="space-y-1">
        <h2 className="type-heading">{t("title")}</h2>
        <p className="text-muted-foreground type-caption">{t("description")}</p>
      </header>
      {sessions.isPending ? (
        <Skeleton aria-busy aria-label={t("loading")} className="h-24 rounded-[var(--radius-tile)]" />
      ) : sessions.isError ? (
        <p role="alert" className="text-destructive type-caption">
          {userMessage(sessions.error)}
        </p>
      ) : (
        <ul aria-label={t("label")} className="divide-border divide-y">
          {list.map((session) => {
            const Icon = /iPhone|iPad|Android/.test(session.device) ? Smartphone : Laptop;
            return (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <Icon aria-hidden className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="type-caption font-medium">
                      {session.device}
                      {session.current && (
                        <span className="bg-secondary text-muted-foreground ml-2 rounded-full px-2 py-0.5 type-fine font-normal">
                          {t("thisDevice")}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground type-caption">
                      {t("active", { when: format.dateTime(session.last_used_at, WHEN) })}
                      {session.ip ? ` · ${session.ip}` : ""}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="outline"
                    disabled={revoke.isPending}
                    aria-label={t("signOutDevice", { device: session.device })}
                    onClick={() =>
                      revoke.mutate(
                        { id: session.id, current: session.current },
                        {
                          onSuccess: () => toast.success(t("signedOut")),
                          onError: (error) => toast.error(userMessage(error)),
                        },
                      )
                    }
                  >
                    {t("signOut")}
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
          disabled={revokeOthers.isPending}
          onClick={() =>
            revokeOthers.mutate(undefined, {
              onSuccess: () => toast.success(t("signedOutOthers")),
              onError: (error) => toast.error(userMessage(error)),
            })
          }
        >
          {revokeOthers.isPending && <Loader2 className="animate-spin" />} {t("signOutOthers")}
        </Button>
      )}
    </section>
  );
}
