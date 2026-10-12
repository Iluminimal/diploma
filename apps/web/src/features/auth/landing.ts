/**
 * Where to send someone who has just signed in. An administrator who did not ask for a particular
 * page (the destination is the home page) lands in the admin area; anyone else, and anyone who
 * did ask for a page, goes where they were headed.
 */
export function landingPath(next: string, role: string | undefined) {
  return next === "/" && role === "admin" ? "/admin" : next;
}
