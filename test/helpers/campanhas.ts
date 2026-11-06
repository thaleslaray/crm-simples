import { api, postJson } from "./api";

// Campanhas pela API, como o front faz.

export interface CampaignView {
  id: string;
  name: string;
  productId: string;
  productName: string;
  channel: string;
  code: string;
  message: string;
  archivedAt: number | null;
  link: string | null;
}

const json = (cookie: string, method: string, path: string, body: unknown) =>
  api(path, { method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const createCampaign = (cookie: string, body: unknown) => postJson("/api/campaigns", body, { cookie });
export const updateCampaign = (cookie: string, id: string, body: Record<string, unknown>) => json(cookie, "PATCH", `/api/campaigns/${id}`, body);

/** Cria e devolve a campanha (arrange de teste feito pelo admin). */
export async function newCampaign(adminCookie: string, productId: string, extra: Record<string, unknown> = {}): Promise<CampaignView> {
  const res = await createCampaign(adminCookie, { name: "Black Friday", productId, channel: "meta", ...extra });
  return ((await res.json()) as { campaign: CampaignView }).campaign;
}

export async function listCampaigns(cookie: string, all = false) {
  const res = await api(`/api/campaigns${all ? "?todos=1" : ""}`, { cookie });
  return (await res.json()) as { campaigns: CampaignView[]; whatsappNumber: string | null; hasFunnel: boolean };
}
