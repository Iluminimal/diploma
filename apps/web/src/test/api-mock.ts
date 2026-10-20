import { vi } from "vitest";

type Call = {
  method: string;
  path: string;
  search: string;
  body: unknown;
  /** Multipart хүсэлтэд (upload) `body`-ийн оронд тавина. */
  form?: FormData;
  headers: Headers;
};
type Reply = Response | { status?: number; body?: unknown };
type Handler = Reply | ((call: Call) => Reply | Promise<Reply>);

export const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });

/**
 * Дуудлага бүрт шинэ response өгдөг handler (`Response`-ыг нэг л удаа унших боломжтой, refetch бол
 * хоёр дахь дуудлага).
 */
export const respond = (body: unknown, status = 200) => () => json(body, status);

export function problem(status: number, title: string, extra: Record<string, unknown> = {}) {
  return json({ title, status, ...extra }, status);
}

/**
 * Multipart body-ийн талбарууд. (undici-ийн өөрийн parser jsdom `File`-ыг татгалздаг тул энэ
 * байна.)
 */
function parseMultipart(raw: string, contentType: string): FormData {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  const form = new FormData();
  if (!boundary) return form;
  for (const part of raw.split(`--${boundary}`).slice(1, -1)) {
    const [head = "", ...rest] = part.replace(/^\r\n/, "").split("\r\n\r\n");
    const value = rest.join("\r\n\r\n").replace(/\r\n$/, "");
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (!name) continue;
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (filename === undefined) form.append(name, value);
    else form.append(name, new File([value], filename));
  }
  return form;
}

/**
 * `fetch`-ийг "METHOD /path" түлхүүртэй router-оор солино (query string үл тооно). `Request` объект
 * (openapi-fetch) болон энгийн URL string хоёуланг боловсруулна. Үл мэдэгдэх route тестийг чангаар
 * унагана.
 */
export function stubApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const mock = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), "http://localhost:3000"), init);
    const url = new URL(request.url);
    const contentType = request.headers.get("content-type") ?? "";
    const multipart = contentType.startsWith("multipart/form-data");
    const text = await request.clone().text();
    const call: Call = {
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: text && !multipart ? JSON.parse(text) : undefined,
      form: multipart ? parseMultipart(text, contentType) : undefined,
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
