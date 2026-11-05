import { env } from "cloudflare:workers";
import { api, postJson } from "./api";

// Equipe pela API, como as telas de admin e as paginas de convite/redefinicao fazem.

export async function createInvite(cookie: string, role: "admin" | "atendente" = "atendente") {
  const res = await postJson("/api/admin/invites", { role }, { cookie });
  const body = (await res.json()) as { token?: string; path?: string; expiresAt?: number };
  return { res, token: body.token!, path: body.path!, expiresAt: body.expiresAt! };
}

export function inviteInfo(token: string) {
  return api(`/api/invites/${token}`);
}

export function acceptInvite(token: string, input: { name: string; email: string; password: string }) {
  return postJson(`/api/invites/${token}`, input);
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "atendente";
}

export async function teamList(cookie: string) {
  const res = await api("/api/admin/members", { cookie });
  return { status: res.status, members: res.ok ? ((await res.json()) as { members: TeamMember[] }).members : [] };
}

export function changeRole(cookie: string, userId: string, role: string) {
  return api(`/api/admin/members/${userId}`, {
    method: "PATCH",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function removeMember(cookie: string, userId: string) {
  return api(`/api/admin/members/${userId}`, { method: "DELETE", cookie });
}

export async function createResetLink(cookie: string, userId: string) {
  const res = await postJson(`/api/admin/members/${userId}/reset-link`, {}, { cookie });
  const body = (await res.json()) as { token?: string; path?: string };
  return { res, token: body.token!, path: body.path! };
}

export function resetInfo(token: string) {
  return api(`/api/password-resets/${token}`);
}

export function resetPassword(token: string, password: string) {
  return postJson(`/api/password-resets/${token}`, { password });
}

/** Arrange: faz todos os links ja emitidos vencerem (o relogio do teste nao anda). */
export async function expireAllLinks(): Promise<void> {
  await env.DB.prepare("UPDATE access_link SET expires_at = ?").bind(Date.now() - 1000).run();
}

/** Arrange: grava direto no D1 um link de redefinicao ainda aberto (sem passar pela emissao). */
export async function insertResetLink(userId: string, createdById: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO access_link (id, kind, token_hash, user_id, created_by_id, created_at, expires_at) VALUES (?, 'redefinicao', ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), crypto.randomUUID(), userId, createdById, now, now + 60_000)
    .run();
}

/** Quantos links de redefinicao do membro ainda valem (nao usados e nao vencidos). */
export async function countOpenResetLinks(userId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM access_link WHERE kind = 'redefinicao' AND user_id = ? AND used_at IS NULL AND expires_at > ?",
  )
    .bind(userId, Date.now())
    .first<{ n: number }>();
  return row?.n ?? 0;
}
