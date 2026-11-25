export type AuthMode = "login" | "register";

/** URL-ийн `?mode=` утгыг мэдэгдэж буй горим болгоно; тодорхойгүй бол нэвтрэх. Server, client хоёуланд ашиглагдана. */
export function parseMode(value: string | string[] | undefined): AuthMode {
  return (Array.isArray(value) ? value[0] : value) === "register" ? "register" : "login";
}
