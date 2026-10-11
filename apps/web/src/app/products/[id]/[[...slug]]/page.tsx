import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Fragment, Suspense } from "react";
import { Price } from "@/components/price";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { getProduct } from "@/features/catalog/api";
import { breadcrumbTrail, productDescription, productJsonLd } from "@/features/catalog/json-ld";
import { JsonLdScripts } from "@/features/seo/json-ld-scripts";
import { productPath } from "@/features/catalog/product";
import { ProductGallery } from "@/features/catalog/product-gallery";
import { sizesFor } from "@/features/catalog/sizes";
import { PurchasePanel } from "@/features/cart/purchase-panel";
import { RailSkeleton, SimilarProducts } from "@/features/catalog/similar-products";
import { Camera, Check } from "lucide-react";

function parseId(raw: string): number | null {
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/products/[id]/[[...slug]]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const product = id ? await getProduct(id) : null;
  if (!product) return { title: "Product not found", robots: { index: false } };
  const description = productDescription(product);
  return {
    title: product.name,
    description,
    alternates: { canonical: productPath(product) },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      images: [{ url: product.image.thumb_800, width: 800, height: 1067, alt: product.name }],
    },
    twitter: { card: "summary_large_image", title: product.name, description, images: [product.image.thumb_800] },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[id]/[[...slug]]">) {
  const { id: rawId, slug } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  // One canonical URL per product: fix a missing or stale slug with a 308.
  if (slug?.join("/") !== product.slug) permanentRedirect(productPath(product));

  const sizes = sizesFor(product);
  const trail = breadcrumbTrail(product);
  const details: [string, string | number | null][] = [
    ["Colour", product.base_colour && product.base_colour !== "NA" ? product.base_colour : null],
    ["Category", `${product.master_category} / ${product.sub_category}`],
    ["Type", product.article_type],
    ["Gender", product.gender],
    ["Season", product.season],
    ["Occasion", product.usage && product.usage !== "NA" ? product.usage : null],
    ["Collection", product.year],
  ];

  return (
    <div className="container-page py-6 md:py-10">
      <JsonLdScripts nodes={productJsonLd(product)} />
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {trail.map((crumb) => (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator className="hidden sm:flex" />
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbPage className="max-w-60 truncate">{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <ProductGallery product={product} />

        <div className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
          <header className="space-y-3">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">{product.name}</h1>
            <p className="flex items-center gap-4">
              <Price cents={product.price_cents} currency={product.currency} className="text-xl font-medium" />
              {product.in_stock ? (
                <span className="text-success inline-flex items-center gap-1 text-sm font-medium">
                  <Check className="size-4" /> In stock
                </span>
              ) : (
                <span className="text-muted-foreground text-sm font-medium">Sold out</span>
              )}
            </p>
          </header>

          <PurchasePanel product={product} sizes={sizes} />

          <Button asChild variant="outline" size="lg" className="h-11 w-full sm:w-fit">
            <Link href="/search">
              <Camera /> Find more like this with a photo
            </Link>
          </Button>

          <dl className="border-border grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 border-t pt-6 text-sm">
            {details
              .filter(([, v]) => v !== null && v !== "")
              .map(([term, value]) => (
                <div key={term} className="contents">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      <Suspense
        fallback={
          <section className="mt-20" aria-label="Similar products">
            <div className="bg-muted mb-6 h-7 w-44 animate-pulse rounded" />
            <RailSkeleton />
          </section>
        }
      >
        <SimilarProducts productId={product.id} />
      </Suspense>
    </div>
  );
}
