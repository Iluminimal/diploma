import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoSearchTrigger } from "@/features/search/photo-search-trigger";
import { Tile } from "./tile";

/** Хар tile: энэ дэлгүүрийг ялгах цорын ганц зүйл ба туршиж үзэх товч. */
export function PhotoTile() {
  return (
    <Tile
      tone="dark"
      size="full"
      label="Search with a photo"
      heading="From a photo to your Bag."
      subtitle="Upload a snapshot or a screenshot. Angel looks at the colour, the cut and the style, and shows the closest pieces in the shop."
      actions={
        <>
          <PhotoSearchTrigger label="Try it" />
          <Button asChild variant="bordered" size="xl">
            <Link href="/search">Open photo search</Link>
          </Button>
        </>
      }
      className="min-h-[22rem] justify-center pb-12 md:min-h-[26rem] md:pb-14"
    />
  );
}
