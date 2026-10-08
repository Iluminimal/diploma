import { vi } from "vitest";

type Call = { method: string; path: string; search: string; body: unknown; headers: Headers };
type Reply = Response | { status?: number; body?: unknown };
type Handler = Reply | ((call: Call) => Reply | Promise<Reply>);

export const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });

export function problem(status: number, title: string, extra: Record<string, unknown> = {}) {
  return json({ title, status, ...extra }, status);
}

/**
 * Replaces `fetch` with a router keyed by "METHOD /path" (query string ignored). Handles both
 * `Request` objects (openapi-fetch) and plain URL strings. Unknown routes fail the test loudly.
 */
export function stubApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const mock = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), "http://localhost:3000"), init);
    const url = new URL(request.url);
    const text = await request.clone().text();
    const call: Call = {
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: text ? JSON.parse(text) : undefined,
      headers: request.headers,
    };
    calls.push(call);
    const handler = routes[`${call.method} ${call.path}`];
    if (!handler) throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    const reply = typeof handler === "function" ? await handler(call) : handler;
    return reply instanceof Response ? reply : json(reply.body, reply.status ?? 200);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock, count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length };
}
