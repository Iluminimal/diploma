"use client";

import { AlertTriangle, KeyRound, LogIn, LogOut, Mail, Phone, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/i18n/use-format";
import { useUserMessage } from "@/lib/api/use-user-message";
import type { components } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useSecurityEvents } from "./use-contact";

type SecurityEvent = components["schemas"]["SecurityEventOut"];
type Kind = SecurityEvent["type"];

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** Нэг үйл явдал бүрийн дүрс; анхаарах ёстой нь (амжилтгүй оролдлого, шинэ төхөөрөмж) өнгөтэй. */
const ICON: Record<Kind, { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; alert?: boolean }> = {
  login: { icon: LogIn },
  login_failed: { icon: AlertTriangle, alert: true },
  new_device: { icon: ShieldAlert, alert: true },
  password_changed: { icon: KeyRound },
  password_reset: { icon: KeyRound },
  sessions_revoked: { icon: LogOut },
  email_changed: { icon: Mail },
  phone_changed: { icon: Phone },
};

/**
 * "Аюулгүй байдлын үйлдэл": бүртгэлд сүүлд юу болсон (нэвтрэлт, буруу нууц үг, шинэ төхөөрөмж,
 * нууц үг солих...). Танихгүй зүйл харвал эзэн төхөөрөмжөө гаргаж, нууц үгээ соль гэж сануулна.
 */
export function SecurityActivityCard() {
  const t = useTranslations("account.security");
  const format = useFormat();
  const userMessage = useUserMessage();
  const events = useSecurityEvents(true);

  return (
    <section className="tile space-y-5 p-6 sm:p-8">
      <header className="space-y-1">
        <h2 className="type-heading">{t("title")}</h2>
        <p className="text-muted-foreground type-caption">{t("description")}</p>
      </header>
      {events.isPending ? (
        <Skeleton aria-busy aria-label={t("loading")} className="h-24 rounded-[var(--radius-tile)]" />
      ) : events.isError ? (
        <p role="alert" className="text-destructive type-caption">
          {userMessage(events.error)}
        </p>
      ) : events.data.length === 0 ? (
        <p className="text-muted-foreground type-caption">{t("empty")}</p>
      ) : (
        <ul aria-label={t("label")} className="divide-border divide-y">
          {events.data.map((event) => {
            const { icon: Icon, alert } = ICON[event.type];
            return (
              <li key={event.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", alert ? "text-warning-foreground" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <p className="type-caption font-medium">
                    {t(`event.${event.type}`)}
                    {event.method && event.type === "login" && (
                      <span className="text-muted-foreground font-normal"> · {t(`method.${event.method}`)}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground type-caption">
                    {format.dateTime(event.created_at, WHEN)} · {event.device}
                    {event.ip ? ` · ${event.ip}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
