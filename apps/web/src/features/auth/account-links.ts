import { Heart, MapPin, Package } from "lucide-react";

export const ACCOUNT_LINKS = [
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
] as const;
