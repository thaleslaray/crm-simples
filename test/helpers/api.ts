import { exports } from "cloudflare:workers";

const ORIGIN = "http://crm.test";

/** Chama o Worker pela borda (fetch handler), como um cliente HTTP de verdade. */
export function api(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const { cookie, headers, ...rest } = init;
  const h = new Headers(headers);
  if (cookie) h.set("cookie", cookie);
  if (rest.method && rest.method !== "GET" && !h.has("origin")) h.set("origin", ORIGIN);
  return exports.default.fetch(`${ORIGIN}${path}`, { ...rest, headers: h });
}

export function postJson(path: string, body: unknown, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return api(path, { ...init, method: "POST", headers, body: JSON.stringify(body) });
}

/** Converte Set-Cookie da resposta em um header `Cookie` para a proxima chamada. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

export async function signIn(email: string, password: string): Promise<{ res: Response; cookie: string }> {
  const res = await postJson("/api/auth/sign-in/email", { email, password });
  return { res, cookie: cookieFrom(res) };
}
