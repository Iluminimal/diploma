/**
 * Дөнгөж нэвтэрсэн хүнийг хаашаа явуулах вэ. Тодорхой хуудас хүсээгүй админ (очих газар нь нүүр
 * хуудас) admin хэсэгт орно; бусад нь, мөн тодорхой хуудас хүссэн хүн хүссэн газраа очно.
 */
export function landingPath(next: string, role: string | undefined) {
  return next === "/" && role === "admin" ? "/admin" : next;
}
