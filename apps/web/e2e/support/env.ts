export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password-123";
export const PASSWORD = "correct horse battery staple";
/**
 * API EMBEDDER=fake-тэй (CI) ажиллаж байвал үнэн. Browser upload бүрийг дахин encode хийдэг;
 * жинхэнэ загвар үүнийг тоохгүй ч pixel-ийн яг таарах fake тэсэхгүй, тиймээс UI тестүүд дахин
 * encode хийсэн зураг аль барааг олохыг шалгахгүй; API тестүүд анхны bytes-ээр шалгасаар байна.
 */
export const FAKE_MODEL = process.env.E2E_FAKE_MODEL === "1";
