import { staffHome } from "./roles";

/**
 * Дөнгөж нэвтэрсэн хүнийг хаашаа явуулах вэ. Тодорхой хуудас хүсээгүй ажилтан (очих газар нь нүүр
 * хуудас) өөрийн нүүр рүү орно: админ самбар руу, агуулахын ажилтан бараа руу; бусад нь, мөн тодорхой
 * хуудас хүссэн хүн хүссэн газраа очно.
 */
export function landingPath(next: string, role: string | undefined) {
  return (next === "/" && staffHome(role)) || next;
}
