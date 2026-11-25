"use client";

import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/admin/panel";
import { StatusDot } from "@/components/admin/status-dot";
import { Button } from "@/components/ui/button";
import { useIsWarehouse } from "@/features/auth/use-role";
import { useFieldError } from "@/i18n/use-field-error";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { AdminPageHeader } from "./page-header";
import { CurrentPhoto, ProductForm } from "./product-form";
import { buildCreateForm, imageProblem, toChanges } from "./product-values";
import {
  useAdminCategories,
  useAdminProduct,
  useCreateProduct,
  useReplaceProductImage,
  useSetProductActive,
  useUpdateProduct,
} from "./use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";

function BackLink() {
  const t = useTranslations("admin.productViews");
  return (
    <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> {t("allProducts")}
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  return <Skeleton aria-busy aria-label={label} className="h-80 rounded-[var(--radius-tile)]" />;
}

export function NewProductView() {
  const t = useTranslations("admin.productViews");
  const router = useRouter();
  const { data: categories, error, refetch } = useAdminCategories();
  const create = useCreateProduct();

  return (
    <div className="max-w-3xl">
      <AdminPageHeader title={t("newProduct")} back={<BackLink />} />
      {error ? (
        <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
      ) : !categories ? (
        <Loading label={t("loadingCategories")} />
      ) : (
        <ProductForm
          categories={categories}
          submitLabel={t("createProduct")}
          onSubmit={async (payload, photo) => {
            if (!photo) return;
            const product = await create.mutateAsync(buildCreateForm(payload, photo));
            toast.success(t("created"));
            router.push(`/admin/products/${product.id}`);
          }}
        />
      )}
    </div>
  );
}

export function EditProductView({ id }: { id: number }) {
  const t = useTranslations("admin.productViews");
  const userMessage = useUserMessage();
  const fieldError = useFieldError();
  const { data: product, error } = useAdminProduct(id);
  const { data: categories } = useAdminCategories();
  const update = useUpdateProduct();
  const replace = useReplaceProductImage();
  const setActive = useSetProductActive();
  // Бараа өөрчлөх нь агуулахын ажилтных; админ зөвхөн харна.
  const canEdit = useIsWarehouse();
  const [photoError, setPhotoError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  if (error) {
    return (
      <div className="max-w-3xl space-y-6">
        <BackLink />
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? t("noSuch") : userMessage(error)}
        </p>
      </div>
    );
  }
  if (!product || !categories) {
    return (
      <div className="max-w-3xl space-y-6">
        <BackLink />
        <Loading label={t("loadingProduct")} />
      </div>
    );
  }

  const upload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setPhotoError(t("choosePhotoFirst"));
      return;
    }
    const problem = imageProblem(file);
    setPhotoError(problem ? fieldError(problem) : undefined);
    if (problem) return;
    try {
      await replace.mutateAsync({ id, file });
      toast.success(t("photoReplaced"));
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      // Алдааны шалтгааныг mutation hook аль хэдийн харуулсан.
    }
  };

  return (
    <div>
      <AdminPageHeader
        title={product.name}
        back={<BackLink />}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {product.is_active ? <StatusDot tone="success">{t("onSale")}</StatusDot> : <StatusDot tone="neutral">{t("withdrawn")}</StatusDot>}
            <span className="text-xs">
              #{product.id} · {product.slug}
              {product.source_id !== null && t("imported")}
            </span>
          </span>
        }
        actions={
          canEdit && (
          <Button
            variant="outline"
            disabled={setActive.isPending}
            onClick={() =>
              setActive.mutate(
                { id, active: !product.is_active },
                { onSuccess: () => toast.success(product.is_active ? t("withdrawnToast") : t("backOnSale")) },
              )
            }
          >
            {product.is_active ? (
              t("withdraw")
            ) : (
              <>
                <RotateCcw aria-hidden /> {t("restore")}
              </>
            )}
          </Button>
          )
        }
      />

      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Panel id="photo-heading" title={t("photo")} className="lg:sticky lg:top-20">
          <div className="space-y-3">
            <CurrentPhoto product={product} />
            {canEdit && <p className="text-muted-foreground text-xs">{t("photoNote")}</p>}
            {canEdit && (
            <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("newPhoto")}
              aria-invalid={Boolean(photoError)}
              aria-describedby={photoError ? "new-photo-error" : undefined}
              className="border-input bg-background block h-11 w-full rounded-xl border px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            {photoError && (
              <p id="new-photo-error" role="alert" className="text-destructive text-xs">
                {photoError}
              </p>
            )}
            <Button variant="outline" className="h-10 w-full rounded-full px-4" disabled={replace.isPending} onClick={() => void upload()}>
              {replace.isPending && <Loader2 aria-hidden className="animate-spin" />} {t("replacePhoto")}
            </Button>
            </>
            )}
          </div>
        </Panel>

        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="sr-only">
            {t("details")}
          </h2>
          {!canEdit && <p className="text-muted-foreground mb-3 text-sm">{t("readOnlyNote")}</p>}
          <ProductForm
            key={product.id}
            categories={categories}
            product={product}
            submitLabel={t("saveChanges")}
            readOnly={!canEdit}
            onSubmit={async (payload) => {
              await update.mutateAsync({ id, changes: toChanges(payload) });
              toast.success(t("saved"));
            }}
          />
        </section>
      </div>
    </div>
  );
}
