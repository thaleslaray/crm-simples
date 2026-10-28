import { api, postJson } from "./api";

// Etiquetas pela API, como o front faz.

export interface LabelView {
  id: string;
  name: string;
  color: string;
}

const json = (cookie: string, method: string, path: string, body: unknown) =>
  api(path, { method, cookie, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function createLabel(cookie: string, name: string, color = "#2563eb") {
  return postJson("/api/labels", { name, color }, { cookie });
}

/** Cria e devolve a etiqueta (arrange de teste feito pelo admin). */
export async function newLabel(adminCookie: string, name: string, color = "#2563eb"): Promise<LabelView> {
  const res = await createLabel(adminCookie, name, color);
  return ((await res.json()) as { label: LabelView }).label;
}

export async function listLabels(cookie: string): Promise<LabelView[]> {
  const res = await api("/api/labels", { cookie });
  return ((await res.json()) as { labels: LabelView[] }).labels;
}

export const updateLabel = (cookie: string, id: string, body: Record<string, unknown>) => json(cookie, "PATCH", `/api/labels/${id}`, body);
export const deleteLabel = (cookie: string, id: string) => json(cookie, "DELETE", `/api/labels/${id}`, {});

export const applyLabel = (cookie: string, contactId: string, labelId: string) => json(cookie, "PUT", `/api/contacts/${contactId}/labels/${labelId}`, {});
export const removeLabel = (cookie: string, contactId: string, labelId: string) => json(cookie, "DELETE", `/api/contacts/${contactId}/labels/${labelId}`, {});

export interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
  labels: LabelView[];
}

/** Lista de contatos com busca e filtro por etiqueta. */
export async function contactList(cookie: string, query: { q?: string; label?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
  const res = await api(`/api/contacts${qs.size ? `?${qs}` : ""}`, { cookie });
  return { status: res.status, contacts: ((await res.json()) as { contacts: ContactRow[] }).contacts };
}

/** Caixa de entrada filtrada por etiqueta. */
export async function inboxByLabel(cookie: string, labelId: string) {
  const res = await api(`/api/conversations?label=${encodeURIComponent(labelId)}`, { cookie });
  return ((await res.json()) as { conversations: { contact: { id: string; labels: LabelView[] } }[] }).conversations;
}
