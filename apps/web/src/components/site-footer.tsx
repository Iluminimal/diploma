import Link from "next/link";

const SHOP = [
  { href: "/products?gender=Women", label: "Women" },
  { href: "/products?gender=Men", label: "Men" },
  { href: "/products?gender=Girls&gender=Boys", label: "Kids" },
  { href: "/products?sort=newest", label: "New arrivals" },
];

export function SiteFooter() {
  return (
    <footer className="border-border mt-24 border-t">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-xs space-y-3">
          <p className="text-lg font-semibold tracking-tight">Lookalike</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Found something you love? Upload a photo and we&apos;ll find the pieces that look like it.
          </p>
        </div>
        <nav aria-label="Shop" className="space-y-3">
          <p className="text-sm font-medium">Shop</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            {SHOP.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Discover" className="space-y-3">
          <p className="text-sm font-medium">Discover</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>
              <Link href="/search" className="hover:text-foreground transition-colors">
                Search by photo
              </Link>
            </li>
            <li>
              <Link href="/products" className="hover:text-foreground transition-colors">
                All products
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-border border-t">
        <p className="container-page text-muted-foreground py-6 text-xs">
          © {new Date().getFullYear()} Lookalike. A diploma project; photos from the Kaggle Fashion Product
          Images dataset.
        </p>
      </div>
    </footer>
  );
}
