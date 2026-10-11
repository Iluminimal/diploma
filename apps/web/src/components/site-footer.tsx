import Link from "next/link";
import { AngelLogo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { categoryHref } from "@/features/catalog/nav";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: categoryHref("women"), label: "Women" },
      { href: categoryHref("men"), label: "Men" },
      { href: categoryHref("kids"), label: "Kids" },
      { href: "/products?sort=newest", label: "New arrivals" },
    ],
  },
  {
    title: "Discover",
    links: [
      { href: "/search", label: "Search by photo" },
      { href: "/products", label: "All products" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/account/profile", label: "Profile", private: true },
      { href: "/account/orders", label: "Orders", private: true },
      { href: "/account/wishlist", label: "Wishlist", private: true },
      { href: "/cart", label: "Cart" },
    ],
  },
] as const;

const LINK =
  "hover:text-foreground focus-visible:ring-ring/60 rounded-sm transition-colors outline-none hover:underline focus-visible:ring-3";

/** Apple's footer: pale grey, small type, a few quiet columns and one line of fine print. */
export function SiteFooter() {
  return (
    <footer className="bg-secondary text-muted-foreground mt-16 text-xs">
      <div className="container-page py-10 md:py-12">
        <div className="border-border grid gap-10 border-b pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs space-y-3">
            <p className="text-foreground text-lg">
              <AngelLogo />
            </p>
            <p className="leading-relaxed">
              Show us a look you love and we&apos;ll find the pieces that match it.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-foreground mb-3 font-semibold">{column.title}</p>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {/* Account pages answer a signed-out visitor with a redirect to the login page. Prefetched,
                      that answer would be cached and replayed after they sign in, sending them back to /login. */}
                    <Link href={link.href} prefetch={"private" in link ? false : undefined} className={LINK}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <p className="max-w-2xl leading-relaxed">
            © {new Date().getFullYear()} Angel. A diploma project; photos from the Kaggle Fashion Product Images
            dataset. Checkout uses test payments.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
