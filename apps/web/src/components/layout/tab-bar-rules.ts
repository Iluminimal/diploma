/**
 * Where the phone tab bar is not wanted: a product page has its own bar for "Add to cart",
 * checkout and the sign-in pages should not offer ways out. (The admin area has no shop chrome.)
 * Kept apart from the bar itself so the layout can decide without loading the bar's code.
 */
export function showsTabBar(pathname: string): boolean {
  if (/^\/products\/\d+/.test(pathname)) return false;
  return !["/checkout", "/login", "/register", "/forgot-password"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
