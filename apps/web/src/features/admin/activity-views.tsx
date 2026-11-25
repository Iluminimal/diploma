"use client";

import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/data-table";
import { SegmentedNav } from "@/components/admin/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { AUDIT_ENTITY_TYPES, type AuditEntry, type AuditListParams } from "./admin-api";
import { useAuditText } from "./audit-text";
import { useDates } from "./format";
import { ListPagination } from "./list-pagination";
import { toQuery } from "./list-params";
import { AdminPageHeader } from "./page-header";
import { useAdminAudit } from "./use-admin";

const DEFAULTS = { entity: "all", actor: 0, action: "", page: 1 };

/** Ажилтны үйлдлийн журнал: шүүлтүүр URL-д (bookmark хийж болно), мөр нь объект руу холбоотой. */
export function ActivityLog({ params }: { params: AuditListParams }) {
  const t = useTranslations("admin.audit");
  const dates = useDates();
  const text = useAuditText();
  const { data, isPending, error, refetch } = useAdminAudit(params);
  const href = (change: Partial<AuditListParams>) => `/admin/activity${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const filtered = params.entity !== "all" || params.actor !== 0 || params.action !== "";

  const columns: Column<AuditEntry>[] = [
    { id: "when", header: t("colWhen"), className: "whitespace-nowrap text-muted-foreground", cell: (entry) => dates.when(entry.created_at) },
    {
      id: "who",
      header: t("colWho"),
      className: "max-w-56",
      cell: (entry) =>
        entry.actor_id ? (
          <Link href={href({ actor: entry.actor_id })} className="block truncate hover:underline">
            {text(entry).who}
          </Link>
        ) : (
          <span className="text-muted-foreground block truncate">{text(entry).who}</span>
        ),
    },
    {
      id: "what",
      header: t("colWhat"),
      cell: (entry) => {
        const { what, detail } = text(entry);
        return (
          <>
            <Link href={href({ action: entry.action })} className="font-medium hover:underline">
              {what}
            </Link>
            {detail && <span className="text-muted-foreground block text-xs">{detail}</span>}
          </>
        );
      },
    },
    {
      id: "object",
      header: t("colObject"),
      className: "whitespace-nowrap",
      cell: (entry) => (
        <Link href={text(entry).href} className="text-brand hover:underline">
          {text(entry).object}
        </Link>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <SegmentedNav
            label={t("filters")}
            value={params.entity}
            items={AUDIT_ENTITY_TYPES.map((entity) => ({
              key: entity,
              label: t(entity === "all" ? "objectAll" : entity === "product" ? "objectProduct" : "objectOrder"),
              href: href({ entity, action: "" }),
            }))}
          />
        }
      />
      {error && !data ? (
        <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
      ) : isPending ? (
        <div aria-busy aria-label={t("loading")} className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? t("empty") : t("emptyAll")}>
          {filtered && (
            <Link href="/admin/activity" className="text-brand text-sm hover:underline">
              {t("clear")}
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {filtered && (
            <Link href="/admin/activity" className="text-brand text-sm hover:underline">
              {t("clear")}
            </Link>
          )}
          <DataTable caption={t("label")} columns={columns} rows={data.items} rowKey={(entry) => entry.id} />
          <ListPagination
            label={t("label")}
            page={data.page}
            pages={data.pages}
            total={data.total}
            hrefFor={(page) => href({ page })}
          />
        </div>
      )}
    </div>
  );
}
