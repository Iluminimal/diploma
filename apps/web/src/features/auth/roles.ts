import type { components } from "@/lib/api/schema";

export type Role = components["schemas"]["UserOut"]["role"];

/** Back-office-ийн ажилтан: админ эсвэл агуулахын ажилтан. Тэд storefront дээр худалдан авалт хийхгүй. */
export const isStaffRole = (role: string | undefined): role is "admin" | "warehouse" =>
  role === "admin" || role === "warehouse";

/**
 * Ажилтны нүүр: хоёр role `/admin`-д орно, гэхдээ тус бүр өөрийн самбарыг харна (админ хянах самбар,
 * агуулахын ажилтан илгээх самбар). Ажилтан биш бол undefined.
 */
export function staffHome(role: string | undefined): string | undefined {
  return isStaffRole(role) ? "/admin" : undefined;
}
