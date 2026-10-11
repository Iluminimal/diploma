import { Heart, MapPin, Package, UserRound } from "lucide-react";

export const ACCOUNT_LINKS = [
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
] as const;
