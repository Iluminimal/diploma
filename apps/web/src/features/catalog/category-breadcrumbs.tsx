import Link from "next/link";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { JsonLdScripts } from "@/features/seo/json-ld-scripts";
import { breadcrumbList } from "./json-ld";
import { categoryHref, type CategoryTrail } from "./nav";

export type Crumb = { label: string; href: string };

/** Home > Men > Clothing > Topwear > T-shirts, сүүлийнх нь холбоос биш. */
export function categoryCrumbs({ department, nodes }: CategoryTrail): Crumb[] {
  return [
    { label: "Home", href: "/" },
    { label: department.name, href: categoryHref(department.slug) },
    ...nodes.map((node) => ({ label: node.name, href: categoryHref(department.slug, node.path) })),
  ];
}

export function CategoryBreadcrumbs({ trail }: { trail: CategoryTrail }) {
  const crumbs = categoryCrumbs(trail);
  const last = crumbs.length - 1;
  return (
    <>
      <JsonLdScripts nodes={[{ "@context": "https://schema.org", ...breadcrumbList(crumbs) }]} />
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === last ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
