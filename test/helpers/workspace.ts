import { api } from "./api";

// Configuracao da empresa pela API, como o front faz.

export async function getWorkspace(cookie?: string): Promise<{ status: number; companyName: string }> {
  const res = await api("/api/workspace", { cookie });
  const body = (await res.json()) as { companyName: string };
  return { status: res.status, companyName: body.companyName };
}

export const setCompanyName = (cookie: string, companyName: unknown) =>
  api("/api/workspace", { method: "PATCH", cookie, headers: { "content-type": "application/json" }, body: JSON.stringify({ companyName }) });
