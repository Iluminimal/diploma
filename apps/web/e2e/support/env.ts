export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.com";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password-123";
export const PASSWORD = "correct horse battery staple";
/**
 * True when the API runs with EMBEDDER=fake (CI). The browser re-encodes every upload, which the
 * real model shrugs off but a pixel-exact fake cannot, so UI tests do not assert *which* product
 * a re-encoded photo finds there; the API tests still do, with the original bytes.
 */
export const FAKE_MODEL = process.env.E2E_FAKE_MODEL === "1";
