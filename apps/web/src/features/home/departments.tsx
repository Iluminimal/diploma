import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { categoryHref } from "@/features/catalog/nav";
import type { Product } from "@/features/catalog/product";
import { newest } from "./home-data";
import { Tile } from "./tile";

const DEPARTMENTS = [
  { slug: "women", label: "Women", blurb: "Dresses, tops and everything in between." },
  { slug: "men", label: "Men", blurb: "Shirts, jeans and sharp shoes." },
  { slug: "kids", label: "Kids", blurb: "Easy, bright and built to be worn." },
] as const;

/** The picture of a department: its second-newest piece, so the first tile's photos are not repeated here. */
async function picture(slug: string): Promise<Product | undefined> {
  const items = await newest({ department: slug, category: "apparel" }, 2);
  return items[1] ?? items[0];
}

function Photo({ product, className }: { product?: Product; className?: string }) {
  if (!product) return null;
  return (
    <div aria-hidden className={className}>
      <Image
        src={product.image.thumb_800}
        alt=""
        width={800}
        height={1067}
        sizes="(min-width: 768px) 24vw, 56vw"
        placeholder={product.image.blur_data_url ? "blur" : "empty"}
        blurDataURL={product.image.blur_data_url ?? undefined}
        className="size-full object-cover object-top"
      />
    </div>
  );
}

function DepartmentTile({ department, product, size }: { department: (typeof DEPARTMENTS)[number]; product?: Product; size: "half" | "full" }) {
  return (
    <Tile
      size={size}
      label={department.label}
      heading={department.label}
      subtitle={department.blurb}
      actions={
        <Button asChild size="lg">
          <Link href={categoryHref(department.slug)}>Shop {department.label.toLowerCase()}</Link>
        </Button>
      }
    >
      <Photo product={product} className="tile-photo mt-8 aspect-3/4 w-[56%] max-w-72 overflow-hidden rounded-t-2xl bg-white md:mt-10 md:w-[48%]" />
    </Tile>
  );
}

/** Women and Men side by side, Kids across the full width: apple.com's rhythm of tiles, 12px apart. */
export async function Departments() {
  const [women, men, kids] = await Promise.all(DEPARTMENTS.map((d) => picture(d.slug)));
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <DepartmentTile department={DEPARTMENTS[0]} product={women} size="half" />
        <DepartmentTile department={DEPARTMENTS[1]} product={men} size="half" />
      </div>
      <DepartmentTile department={DEPARTMENTS[2]} product={kids} size="full" />
    </>
  );
}
