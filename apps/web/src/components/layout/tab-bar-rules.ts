/**
 * Where the phone tab bar is not wanted: checkout and the sign-in pages are one-way flows and
 * should not offer ways out. (The admin area has no shop chrome.)
 * Kept apart from the bar itself so the layout can decide without loading the bar's code.
 */
export function showsTabBar(pathname: string): boolean {
  return !["/checkout", "/login", "/register", "/forgot-password"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
