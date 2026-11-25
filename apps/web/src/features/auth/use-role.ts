"use client";

import { useAuth } from "./auth-store";
import { isStaffRole } from "./roles";

/** Админ эсвэл агуулахын ажилтан бол back-office-ийн хэрэглэгч: storefront дээр сагс, захиалга ашиглахгүй. */
export function useIsStaff(): boolean {
  return useAuth((state) => isStaffRole(state.user?.role));
}

/** Хэрэглэгч, сэтгэгдэл, статистик, захиалгын цуцлалт/буцаалт хийх эрхтэй. */
export function useIsAdmin(): boolean {
  return useAuth((state) => state.user?.role === "admin");
}

/** Бараа, нөөц, захиалгын ачилт (ship/deliver) хийх эрхтэй. */
export function useIsWarehouse(): boolean {
  return useAuth((state) => state.user?.role === "warehouse");
}
