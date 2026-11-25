import { Heart, MapPin, Package, UserRound } from "lucide-react";

export const ACCOUNT_LINKS = [
  { href: "/account/profile", key: "profile", icon: UserRound },
  { href: "/account/orders", key: "orders", icon: Package },
  { href: "/account/wishlist", key: "wishlist", icon: Heart },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
] as const;
