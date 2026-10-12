"use client";

import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, userMessage } from "@/lib/api/errors";
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

function BackLink() {
  return (
    <Link href="/admin/products" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft aria-hidden className="size-4" /> All products
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  return <Skeleton aria-busy aria-label={label} className="h-80 rounded-2xl" />;
}

export function NewProductView() {
  const router = useRouter();
  const { data: categories, error, refetch } = useAdminCategories();
  const create = useCreateProduct();

  return (
    <div className="max-w-3xl space-y-6">
      <BackLink />
      <h1 className="type-title">New product</h1>
      {error ? (
        <div className="space-y-3">
          <p role="alert" className="text-destructive">
            {userMessage(error)}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !categories ? (
        <Loading label="Loading categories" />
      ) : (
        <ProductForm
          categories={categories}
          submitLabel="Create product"
          onSubmit={async (payload, photo) => {
            if (!photo) return;
            const product = await create.mutateAsync(buildCreateForm(payload, photo));
            toast.success("Product created. It can be found by visual search now.");
            router.push(`/admin/products/${product.id}`);
          }}
        />
      )}
    </div>
  );
}

export function EditProductView({ id }: { id: number }) {
  const { data: product, error } = useAdminProduct(id);
  const { data: categories } = useAdminCategories();
  const update = useUpdateProduct();
  const replace = useReplaceProductImage();
  const setActive = useSetProductActive();
  const [photoError, setPhotoError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  if (error) {
    return (
      <div className="max-w-3xl space-y-6">
        <BackLink />
        <p role="alert" className="text-muted-foreground">
          {error instanceof ApiError && error.isNotFound ? "There is no such product." : userMessage(error)}
        </p>
      </div>
    );
  }
  if (!product || !categories) {
    return (
      <div className="max-w-3xl space-y-6">
        <BackLink />
        <Loading label="Loading the product" />
      </div>
    );
  }

  const upload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setPhotoError("Choose a new photo first.");
      return;
    }
    const problem = imageProblem(file);
    setPhotoError(problem ?? undefined);
    if (problem) return;
    try {
      await replace.mutateAsync({ id, file });
      toast.success("Photo replaced. Visual search now uses the new one.");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      // The mutation hook already showed the reason.
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="type-title">{product.name}</h1>
          <p className="text-muted-foreground text-xs">
            #{product.id} · {product.slug}
            {product.source_id !== null && " · imported from the dataset"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {product.is_active ? <Badge variant="secondary">On sale</Badge> : <Badge variant="destructive">Withdrawn</Badge>}
          <Button
            variant="outline"
            className="h-9 rounded-lg px-3"
            disabled={setActive.isPending}
            onClick={() =>
              setActive.mutate(
                { id, active: !product.is_active },
                {
                  onSuccess: () =>
                    toast.success(product.is_active ? "Product withdrawn." : "Product is back on sale."),
                },
              )
            }
          >
            {product.is_active ? (
              "Withdraw"
            ) : (
              <>
                <RotateCcw aria-hidden /> Restore
              </>
            )}
          </Button>
        </div>
      </div>

      <section aria-labelledby="photo-heading" className="flex flex-wrap items-start gap-6">
        <CurrentPhoto product={product} />
        <div className="min-w-60 flex-1 space-y-3">
          <h2 id="photo-heading" className="font-semibold">
            Photo
          </h2>
          <p className="text-muted-foreground text-sm">
            A new photo is also what visual search compares against, so it is analysed again when you upload it.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="New photo"
            aria-invalid={Boolean(photoError)}
            aria-describedby={photoError ? "new-photo-error" : undefined}
            className="border-input block h-11 w-full rounded-xl border px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
          />
          {photoError && (
            <p id="new-photo-error" role="alert" className="text-destructive text-xs">
              {photoError}
            </p>
          )}
          <Button variant="outline" className="h-10 rounded-full px-4" disabled={replace.isPending} onClick={() => void upload()}>
            {replace.isPending && <Loader2 aria-hidden className="animate-spin" />} Replace photo
          </Button>
        </div>
      </section>

      <section aria-labelledby="details-heading" className="space-y-4">
        <h2 id="details-heading" className="font-semibold">
          Details
        </h2>
        <ProductForm
          key={product.updated_at}
          categories={categories}
          product={product}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update.mutateAsync({ id, changes: toChanges(payload) });
            toast.success("Product saved.");
          }}
        />
      </section>
    </div>
  );
}
