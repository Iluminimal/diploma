import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center gap-5 py-32 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The product may have been removed, or the link is mistyped.
      </p>
      <div className="flex gap-2">
        <Button asChild size="lg">
          <Link href="/products">Browse products</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/search">Search by photo</Link>
        </Button>
      </div>
    </div>
  );
}
