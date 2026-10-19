import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
      { href: "/cart", label: "Bag" },
    ],
  },
] as const;

const LINK =
  "text-foreground/80 hover:text-foreground focus-visible:ring-ring/60 rounded-sm transition-colors outline-none hover:underline focus-visible:ring-3";

/**
 * Apple's global footer: pale grey, 12px type, the directory (a small bold heading over a short
 * list of links, per column), a "more ways to shop" line and the copyright. Rules between the
 * parts are 1px hairlines. No columns collapse on a phone: two columns side by side keep every
 * link one tap away.
 */
export function SiteFooter() {
  return (
    <footer className="bg-secondary text-muted-foreground type-fine mt-16">
      <div className="container-nav pt-4 pb-5 md:pt-5">
        <div className="border-border grid grid-cols-2 gap-x-6 gap-y-8 border-b py-6 md:grid-cols-3 md:py-8">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-foreground mb-2.5 font-semibold">{column.title}</p>
              <ul className="space-y-2">
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
        <p className="border-border border-b py-3">
          More ways to shop:{" "}
          <Link href="/search" className="text-brand hover:underline">
            search with a photo
          </Link>{" "}
          or{" "}
          <Link href="/products" className="text-brand hover:underline">
            browse everything
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-3">
          <p>Copyright © {new Date().getFullYear()} Angel. All rights reserved.</p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
