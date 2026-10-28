import { api, postJson } from "./api";
import { conversationWithClient, inbox } from "./conversations";

// Funis, etapas e cards pela API, como o front faz.

export interface StageView {
  id: string;
  name: string;
}
export interface FunnelView {
  id: string;
  name: string;
  stages: StageView[];
}
export interface CardView {
  contactId: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string | null;
  avatarUrl: string | null;
  lastMessage: { type: string; text: string | null; timestamp: number } | null;
  labels: { id: string; name: string; color: string }[];
}
export interface BoardView {
  funnel: FunnelView;
  stages: { id: string; name: string; cards: CardView[] }[];
}

const json = (cookie: string, method: string, path: string, body: unknown) =>
  api(path, { method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const createFunnel = (cookie: string, name: string) => postJson("/api/funnels", { name }, { cookie });
export const renameFunnel = (cookie: string, id: string, name: string) => json(cookie, "PATCH", `/api/funnels/${id}`, { name });
export const deleteFunnel = (cookie: string, id: string) => json(cookie, "DELETE", `/api/funnels/${id}`, {});
export const addStage = (cookie: string, funnelId: string, name: string) => postJson(`/api/funnels/${funnelId}/stages`, { name }, { cookie });
export const renameStage = (cookie: string, funnelId: string, stageId: string, name: string) =>
  json(cookie, "PATCH", `/api/funnels/${funnelId}/stages/${stageId}`, { name });
export const reorderStages = (cookie: string, funnelId: string, stageIds: string[]) =>
  json(cookie, "PUT", `/api/funnels/${funnelId}/stages/order`, { stageIds });
export const deleteStage = (cookie: string, funnelId: string, stageId: string, moveTo?: string) =>
  json(cookie, "DELETE", `/api/funnels/${funnelId}/stages/${stageId}`, moveTo ? { moveTo } : {});

export const addCard = (cookie: string, funnelId: string, contactId: string, stageId: string) =>
  postJson(`/api/funnels/${funnelId}/cards`, { contactId, stageId }, { cookie });
export const moveCard = (cookie: string, funnelId: string, contactId: string, stageId: string, index?: number) =>
  json(cookie, "PUT", `/api/funnels/${funnelId}/cards/${contactId}`, { stageId, ...(index === undefined ? {} : { index }) });
export const removeCard = (cookie: string, funnelId: string, contactId: string) =>
  json(cookie, "DELETE", `/api/funnels/${funnelId}/cards/${contactId}`, {});

export async function listFunnels(cookie: string): Promise<FunnelView[]> {
  const res = await api("/api/funnels", { cookie });
  return ((await res.json()) as { funnels: FunnelView[] }).funnels;
}

export async function board(cookie: string, funnelId: string, query = "") {
  const res = await api(`/api/funnels/${funnelId}/board${query}`, { cookie });
  return { status: res.status, body: (await res.json()) as BoardView };
}

/** Cria o funil com as etapas dadas (arrange feito pelo admin) e devolve o funil completo. */
export async function newFunnel(adminCookie: string, name: string, stages: string[]): Promise<FunnelView> {
  const created = (await (await createFunnel(adminCookie, name)).json()) as { funnel: FunnelView };
  for (const s of stages) await addStage(adminCookie, created.funnel.id, s);
  return (await listFunnels(adminCookie)).find((f) => f.id === created.funnel.id)!;
}

/** O cliente escreve (webhook) e devolve o id do contato criado. */
export async function newClient(cookie: string, phone: string): Promise<string> {
  await conversationWithClient(cookie, phone);
  return (await inbox(cookie)).find((c) => c.contact.phone === phone)!.contact.id;
}

/** Telefones dos cards por etapa, na ordem do quadro. */
export async function layout(cookie: string, funnelId: string, query = ""): Promise<Record<string, string[]>> {
  const { body } = await board(cookie, funnelId, query);
  return Object.fromEntries(body.stages.map((s) => [s.name, s.cards.map((c) => c.phone ?? "")]));
}
