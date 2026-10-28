import { env } from "cloudflare:workers";
import { api, postJson } from "./api";

// Notas internas e ficha do contato pela API, como o front faz.

export interface NoteView {
  id: string;
  conversationId: string;
  text: string;
  authorName: string | null;
  createdAt: number;
}

export interface FichaView {
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
    notes: string | null;
    avatarUrl: string | null;
  };
  conversations: { id: string; status: string; assigneeName: string | null; assignees: string[]; createdAt: number }[];
  notes: NoteView[];
}

export function addNote(cookie: string, conversationId: string, text: string) {
  return postJson(`/api/conversations/${conversationId}/notes`, { text }, { cookie });
}

export async function listNotes(cookie: string, conversationId: string): Promise<NoteView[]> {
  const res = await api(`/api/conversations/${conversationId}/notes`, { cookie });
  return ((await res.json()) as { notes: NoteView[] }).notes;
}

export async function ficha(cookie: string, contactId: string): Promise<FichaView> {
  const res = await api(`/api/contacts/${contactId}`, { cookie });
  return (await res.json()) as FichaView;
}

export function editContact(cookie: string, contactId: string, body: Record<string, unknown>) {
  return api(`/api/contacts/${contactId}`, {
    method: "PATCH",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function refreshAvatar(cookie: string, contactId: string) {
  return postJson(`/api/contacts/${contactId}/avatar/refresh`, {}, { cookie });
}

/** Faz a foto do contato parecer buscada ha muito tempo (arrange: URL temporaria expirada). */
export async function ageAvatar(contactId: string, ageMs: number): Promise<void> {
  await env.DB.prepare("UPDATE contact SET avatar_fetched_at = ? WHERE id = ?").bind(Date.now() - ageMs, contactId).run();
}
