// Cliente da API do CRM (mesma origem; o cookie de sessão vai sozinho).

export interface Conversation {
  id: string;
  status: ConversationStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  unreadCount: number;
  contact: { id: string; name: string | null; phone: string | null; avatarUrl: string | null; labels: Label[] };
  lastMessage: {
    type: MessageType;
    text: string | null;
    timestamp: number;
    direction: "in" | "out";
    /** Entrega da última mensagem enviada (nulo se for do cliente). */
    status: SendStatus | null;
    authorId: string | null;
    authorName: string | null;
  } | null;
}

/** Etiqueta do contato: nome + cor (hex). */
export interface Label {
  id: string;
  name: string;
  color: string;
}

/** Produto cadastrado pelo admin; preço em centavos. */
export interface Product {
  id: string;
  name: string;
  priceCents: number;
  archivedAt: number | null;
}

export type CampaignChannel = "meta" | "google" | "instagram" | "tiktok" | "outro";

/** Campanha cadastrada pelo admin. `link` é null enquanto não há número do WhatsApp conectado. */
export interface Campaign {
  id: string;
  name: string;
  productId: string;
  productName: string;
  channel: CampaignChannel;
  code: string;
  message: string;
  archivedAt: number | null;
  link: string | null;
}

export interface CampaignList {
  campaigns: Campaign[];
  whatsappNumber: string | null;
  /** Há funil com etapa? Sem ele a criação automática de negócio não acontece. */
  hasFunnel: boolean;
}

/** Linha do relatório de campanhas (uma origem). `conversion` = ganhos ÷ criados; null sem criados. */
export interface CampaignReportRow {
  key: string;
  label: string;
  created: number;
  won: number;
  lost: number;
  revenueCents: number;
  conversion: number | null;
}
export interface CampaignReport {
  rows: CampaignReportRow[];
  total: Omit<CampaignReportRow, "key" | "label">;
}

/** Linha da lista de contatos. */
export interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
  labels: Label[];
}

export type ConversationStatus = "aberta" | "em_andamento" | "aguardando_cliente" | "resolvida";

/** Evento de sistema da linha do tempo (assumir, atribuir, transferir, resolver, reabrir). */
export interface TimelineEvent {
  id: string;
  type: "assumida" | "atribuida" | "transferida" | "resolvida" | "reaberta" | "devolvida" | "campanha";
  timestamp: number;
  actorName: string | null;
  toName: string | null;
  fromName: string | null;
  /** So em `campanha`. */
  campaignName?: string | null;
  campaignAction?: "criou" | "voltou" | null;
}

/** Nota interna: só a equipe vê; aparece na linha do tempo e na ficha. */
export interface Note {
  id: string;
  conversationId: string;
  text: string;
  authorName: string | null;
  createdAt: number;
}

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  avatarUrl: string | null;
  labels: Label[];
}

export interface Stage {
  id: string;
  name: string;
}

export interface Funnel {
  id: string;
  name: string;
  stages: Stage[];
}

/** Origem do negócio: `campanha` vem da criação automática; as outras o atendente escolhe. */
export type OriginKind = "campanha" | "indicacao" | "organico" | "cliente_antigo" | "outro";
export type DealStatus = "aberto" | "ganho" | "perdido";
export type LostReason = "preco" | "sem_resposta" | "comprou_de_outro" | "sem_interesse" | "sem_perfil" | "outro";

/** Fechar o negócio: Ganhou traz o valor confirmado; Perdeu traz o motivo e, se quiser, uma observação. */
export type DealCloseInput = { status: "ganho"; valueCents: number } | { status: "perdido"; lostReason: LostReason; lostNote?: string };

/** Cartão do kanban: um negócio aberto (cliente, produto e valor) numa etapa. */
export interface FunnelCard {
  dealId: string;
  dealStatus: DealStatus;
  lostReason: LostReason | null;
  lostNote: string | null;
  closedAt: number | null;
  closedById: string | null;
  productId: string | null;
  productName: string | null;
  valueCents: number | null;
  originKind: OriginKind | null;
  originCampaignId: string | null;
  originCampaignName: string | null;
  contactId: string;
  name: string | null;
  phone: string | null;
  conversationId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: ConversationStatus | null;
  avatarUrl: string | null;
  lastMessage: { type: MessageType; text: string | null; timestamp: number } | null;
  labels: Label[];
}

export interface Board {
  funnel: Funnel;
  stages: (Stage & { cards: FunnelCard[] })[];
}

/** Filtros do kanban: etiqueta (id), responsável da conversa ("me", "none" ou o id do membro) e produto ("none" ou o id). */
export interface BoardFilter {
  label: string;
  assignee: string;
  product: string;
  /** Situação dos negócios no quadro; vazio é "aberto". */
  status: "" | "ganho" | "perdido";
}

/** Negócio do contato, como a ficha mostra (abertos e fechados). */
export interface ContactDeal {
  id: string;
  funnelId: string;
  funnelName: string;
  stageId: string;
  stageName: string;
  productId: string | null;
  productName: string | null;
  valueCents: number | null;
  status: DealStatus;
  originKind: OriginKind | null;
  originCampaignName: string | null;
}

/** Campos que o atendente preenche ao criar ou editar um negócio. */
export interface DealInput {
  productId?: string | null;
  valueCents?: number | null;
  originKind?: OriginKind | null;
  /** Obrigatório (campanha ativa) quando `originKind` é `campanha`. */
  originCampaignId?: string | null;
}

export interface Ficha {
  deals: ContactDeal[];
  contact: Contact;
  conversations: { id: string; status: ConversationStatus; assigneeName: string | null; assignees: string[]; createdAt: number }[];
  notes: Note[];
}

export type ContactEdit = Pick<Contact, "name" | "email" | "company" | "notes">;

export interface Member {
  id: string;
  name: string;
  role: "admin" | "atendente";
}

/** Filtros da caixa: status, responsável ("me", "none" ou o id do membro) e etiqueta (id). */
export interface InboxFilter {
  status: ConversationStatus | "";
  assignee: string;
  label: string;
}

export type MessageType =
  | "text" | "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contact" | "unsupported";

export interface MessageMedia {
  status: "pending" | "available" | "failed" | "expired";
  mime: string | null;
  size: number | null;
  name: string | null;
}

export interface Message {
  id: string;
  direction: "in" | "out";
  type: MessageType;
  text: string | null;
  /** Só mensagens de saída: enviando, enviada, entregue, lida, reproduzida, falhou (recusa) ou incerto (timeout). */
  status?: SendStatus | null;
  authorName?: string | null;
  /** Id de quem enviou (null: cliente ou membro removido); dá a cor estável do autor. */
  sentById?: string | null;
  timestamp: number;
  media: MessageMedia | null;
  location: { lat: number; lng: number; name: string | null; address: string | null } | null;
  contact: { name: string | null; phone: string | null } | null;
  /** Mensagem citada (some se a original é anterior à conexão do número). */
  quote?: MessageQuote | null;
  /** Reações: no máximo uma do cliente e uma da equipe (`userName`: atendente da equipe; nulo para cliente ou celular). */
  reactions: MessageReaction[];
}

export interface MessageReaction {
  side: "contact" | "team";
  emoji: string;
  /** Id do atendente da reação da equipe (a tela compara com o próprio id para mostrar "Você"); nulo para cliente ou celular. */
  userId: string | null;
  userName: string | null;
}

export interface MessageQuote {
  id: string;
  type: MessageType;
  text: string | null;
  direction: "in" | "out";
  authorName: string | null;
}

export type SendStatus = "sending" | "sent" | "delivered" | "read" | "played" | "failed" | "uncertain";

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

/** Conexão do número do WhatsApp. `unknown` = ainda sem informação (nenhum aviso é mostrado). */
export interface ConnectionState {
  status: "connected" | "connecting" | "disconnected" | "unknown";
  temporaryBan: boolean;
  lastDisconnectReason: string | null;
  updatedAt: number | null;
}

export interface ConnectionWithQr {
  connection: ConnectionState;
  qrcode?: string;
}

export interface UazapiConfigSummary {
  configured: boolean;
  baseUrl?: string;
  /** `••••` + 4 últimos do admin token. Ausente = ainda sem admin token. */
  adminTokenHint?: string;
  /** Instância em uso (só id e nome; o token nunca vem). */
  instance?: { id: string; name: string } | null;
}

/** Instância do servidor da Uazapi, como a tela a mostra. */
export interface UazapiInstanceItem {
  id: string;
  name: string;
  status: string;
  profileName: string;
  profilePicUrl: string;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Falha na API (${status})`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

async function sendJson<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

/** Chamada das rotas da Uazapi: quando recusa, rejeita com `code` (o `error` do corpo) para a tela escolher a mensagem. */
async function adminCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new ApiError(res.status), { code: data.error });
  }
  return res.json() as Promise<T>;
}

export interface TeamMember extends Member {
  email: string;
}

/** Resposta de uma rota publica de link (convite/redefinição): o corpo de erro traz a mensagem pronta para mostrar. */
export type LinkResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; message: string | null };

async function linkCall<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<LinkResult<T>> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: json as T };
  return {
    ok: false,
    status: res.status,
    error: String(json.error ?? "erro"),
    message: typeof json.message === "string" ? json.message : null,
  };
}

/** Primeiro acesso: a tela só abre enquanto não há usuário e o SETUP_CODE está configurado. */
export const firstAccess = {
  needed: () => linkCall<{ needed: boolean }>("GET", "/api/setup"),
  create: (input: { code: string; name: string; email: string; password: string }) =>
    linkCall<{ ok: true }>("POST", "/api/setup", input),
};

export const links = {
  invite: (token: string) => linkCall<{ role: "admin" | "atendente" }>("GET", `/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, input: { name: string; email: string; password: string }) =>
    linkCall<{ ok: true }>("POST", `/api/invites/${encodeURIComponent(token)}`, input),
  reset: (token: string) => linkCall<{ name: string }>("GET", `/api/password-resets/${encodeURIComponent(token)}`),
  resetPassword: (token: string, password: string) =>
    linkCall<{ ok: true }>("POST", `/api/password-resets/${encodeURIComponent(token)}`, { password }),
};

export const api = {
  team: () => getJson<{ members: TeamMember[] }>("/api/admin/members"),
  createInvite: (role: Member["role"]) =>
    sendJson<{ path: string; expiresAt: number }>("POST", "/api/admin/invites", { role }),
  changeRole: (id: string, role: Member["role"]) =>
    sendJson<{ ok: true }>("PATCH", `/api/admin/members/${encodeURIComponent(id)}`, { role }),
  removeMember: (id: string) => sendJson<{ ok: true }>("DELETE", `/api/admin/members/${encodeURIComponent(id)}`, {}),
  createResetLink: (id: string) =>
    sendJson<{ path: string; expiresAt: number }>("POST", `/api/admin/members/${encodeURIComponent(id)}/reset-link`, {}),
  sendText: (id: string, text: string, replyTo?: string) =>
    sendJson<{ message: Message }>("POST", `/api/conversations/${encodeURIComponent(id)}/messages`, { text, replyTo }),
  /** Anexo (legenda opcional) ou nota de voz (`voice`, sem legenda). */
  sendMedia: async (id: string, file: File, opts: { text?: string; voice?: boolean; replyTo?: string } = {}) => {
    const form = new FormData();
    form.set("file", file);
    if (opts.text) form.set("text", opts.text);
    if (opts.voice) form.set("voice", "1");
    if (opts.replyTo) form.set("replyTo", opts.replyTo);
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw Object.assign(new ApiError(res.status), { code: body.error });
    }
    return (await res.json()) as { message: Message };
  },
  resend: (id: string, messageId: string) =>
    sendJson<{ message: Message }>(
      "POST",
      `/api/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/resend`,
      {},
    ),
  /** Reage a uma mensagem do cliente; `emoji` vazio remove a reação da equipe. */
  reactToMessage: (id: string, messageId: string, emoji: string) =>
    sendJson<{ reactions: MessageReaction[] }>(
      "PUT",
      `/api/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/reaction`,
      { emoji },
    ),
  me: () => getJson<{ user: { role: "admin" | "atendente" } }>("/api/me"),
  quickReplies: () => getJson<{ quickReplies: QuickReply[] }>("/api/quick-replies"),
  createQuickReply: (r: { shortcut: string; text: string }) =>
    sendJson<{ quickReply: QuickReply }>("POST", "/api/quick-replies", r),
  updateQuickReply: (id: string, r: { shortcut: string; text: string }) =>
    sendJson<{ quickReply: QuickReply }>("PATCH", `/api/quick-replies/${encodeURIComponent(id)}`, r),
  deleteQuickReply: (id: string) => sendJson<{ ok: true }>("DELETE", `/api/quick-replies/${encodeURIComponent(id)}`, {}),
  /** Abrir a conversa: zera as não lidas e marca como lidas no WhatsApp. */
  markRead: (id: string) => sendJson<{ ok: true }>("POST", `/api/conversations/${encodeURIComponent(id)}/read`, {}),
  preferences: () => getJson<{ signatureEnabled: boolean }>("/api/me/preferences"),
  setSignature: (signatureEnabled: boolean) =>
    sendJson<{ signatureEnabled: boolean }>("PATCH", "/api/me/preferences", { signatureEnabled }),
  conversations: (filter?: InboxFilter) => {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set("status", filter.status);
    if (filter?.assignee) qs.set("assignee", filter.assignee);
    if (filter?.label) qs.set("label", filter.label);
    return getJson<{ conversations: Conversation[] }>(`/api/conversations${qs.size ? `?${qs}` : ""}`);
  },
  members: () => getJson<{ members: Member[] }>("/api/members"),
  events: (id: string) => getJson<{ events: TimelineEvent[] }>(`/api/conversations/${encodeURIComponent(id)}/events`),
  assume: (id: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/assume`, {}),
  assign: (id: string, userId: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/assign`, { userId }),
  resolve: (id: string) =>
    sendJson<{ conversation: Conversation }>("POST", `/api/conversations/${encodeURIComponent(id)}/resolve`, {}),
  notes: (id: string) => getJson<{ notes: Note[] }>(`/api/conversations/${encodeURIComponent(id)}/notes`),
  addNote: (id: string, text: string) =>
    sendJson<{ note: Note }>("POST", `/api/conversations/${encodeURIComponent(id)}/notes`, { text }),
  ficha: (contactId: string) => getJson<Ficha>(`/api/contacts/${encodeURIComponent(contactId)}`),
  contactDeals: (contactId: string) => getJson<{ deals: Ficha["deals"] }>(`/api/contacts/${encodeURIComponent(contactId)}/deals`),
  editContact: (contactId: string, edit: ContactEdit) =>
    sendJson<{ contact: Contact }>("PATCH", `/api/contacts/${encodeURIComponent(contactId)}`, edit),
  /** A foto quebrou (URL temporária expirada): busca outra. */
  refreshAvatar: (contactId: string) =>
    sendJson<{ contact: Contact }>("POST", `/api/contacts/${encodeURIComponent(contactId)}/avatar/refresh`, {}),
  workspace: () => getJson<{ companyName: string }>("/api/workspace"),
  setCompanyName: (companyName: string) => sendJson<{ companyName: string }>("PATCH", "/api/workspace", { companyName }),
  labels: () => getJson<{ labels: Label[] }>("/api/labels"),
  createLabel: (l: Omit<Label, "id">) => sendJson<{ label: Label }>("POST", "/api/labels", l),
  updateLabel: (id: string, l: Partial<Omit<Label, "id">>) =>
    sendJson<{ label: Label }>("PATCH", `/api/labels/${encodeURIComponent(id)}`, l),
  deleteLabel: (id: string) => sendJson<{ ok: true }>("DELETE", `/api/labels/${encodeURIComponent(id)}`, {}),
  campaigns: (all = false) => getJson<CampaignList>(`/api/campaigns${all ? "?todos=1" : ""}`),
  createCampaign: (c: { name: string; productId: string; channel: CampaignChannel; message?: string }) =>
    sendJson<{ campaign: Campaign }>("POST", "/api/campaigns", c),
  updateCampaign: (id: string, c: { name?: string; message?: string; archived?: boolean }) =>
    sendJson<{ campaign: Campaign }>("PATCH", `/api/campaigns/${encodeURIComponent(id)}`, c),
  campaignReport: (from: number, to: number, product: string) =>
    getJson<CampaignReport>(`/api/reports/campaigns?from=${from}&to=${to}${product ? `&product=${encodeURIComponent(product)}` : ""}`),
  products: (all = false) => getJson<{ products: Product[] }>(`/api/products${all ? "?todos=1" : ""}`),
  createProduct: (p: { name: string; priceCents: number }) => sendJson<{ product: Product }>("POST", "/api/products", p),
  updateProduct: (id: string, p: { name?: string; priceCents?: number; archived?: boolean }) =>
    sendJson<{ product: Product }>("PATCH", `/api/products/${encodeURIComponent(id)}`, p),
  applyLabel: (contactId: string, labelId: string) =>
    sendJson<{ contact: Contact }>("PUT", `/api/contacts/${encodeURIComponent(contactId)}/labels/${encodeURIComponent(labelId)}`, {}),
  removeLabel: (contactId: string, labelId: string) =>
    sendJson<{ contact: Contact }>("DELETE", `/api/contacts/${encodeURIComponent(contactId)}/labels/${encodeURIComponent(labelId)}`, {}),
  contacts: (q: string, label: string) => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (label) qs.set("label", label);
    return getJson<{ contacts: ContactRow[] }>(`/api/contacts${qs.size ? `?${qs}` : ""}`);
  },
  funnels: () => getJson<{ funnels: Funnel[] }>("/api/funnels"),
  createFunnel: (name: string) => sendJson<{ funnel: Funnel }>("POST", "/api/funnels", { name }),
  renameFunnel: (id: string, name: string) => sendJson<{ ok: true }>("PATCH", `/api/funnels/${encodeURIComponent(id)}`, { name }),
  deleteFunnel: (id: string) => sendJson<{ ok: true }>("DELETE", `/api/funnels/${encodeURIComponent(id)}`, {}),
  addStage: (funnelId: string, name: string) =>
    sendJson<{ stage: Stage }>("POST", `/api/funnels/${encodeURIComponent(funnelId)}/stages`, { name }),
  renameStage: (funnelId: string, stageId: string, name: string) =>
    sendJson<{ ok: true }>("PATCH", `/api/funnels/${encodeURIComponent(funnelId)}/stages/${encodeURIComponent(stageId)}`, { name }),
  reorderStages: (funnelId: string, stageIds: string[]) =>
    sendJson<{ ok: true }>("PUT", `/api/funnels/${encodeURIComponent(funnelId)}/stages/order`, { stageIds }),
  /** Etapa com negócios: `moveTo` é a etapa que recebe os negócios (sem ele o servidor responde 409). */
  deleteStage: (funnelId: string, stageId: string, moveTo?: string) =>
    sendJson<{ ok: true }>(
      "DELETE",
      `/api/funnels/${encodeURIComponent(funnelId)}/stages/${encodeURIComponent(stageId)}`,
      moveTo ? { moveTo } : {},
    ),
  board: (funnelId: string, filter: BoardFilter) => {
    const qs = new URLSearchParams();
    if (filter.label) qs.set("label", filter.label);
    if (filter.assignee) qs.set("assignee", filter.assignee);
    if (filter.product) qs.set("product", filter.product);
    if (filter.status) qs.set("status", filter.status);
    return getJson<Board>(`/api/funnels/${encodeURIComponent(funnelId)}/board${qs.size ? `?${qs}` : ""}`);
  },
  addDeal: (funnelId: string, contactId: string, stageId: string, input: DealInput = {}) =>
    sendJson<{ deal: { id: string } }>("POST", `/api/funnels/${encodeURIComponent(funnelId)}/deals`, { contactId, stageId, ...input }),
  moveDeal: (funnelId: string, dealId: string, stageId: string, index?: number) =>
    sendJson<{ ok: true }>("PUT", `/api/funnels/${encodeURIComponent(funnelId)}/deals/${encodeURIComponent(dealId)}`, {
      stageId,
      index,
    }),
  editDeal: (funnelId: string, dealId: string, input: DealInput) =>
    sendJson<{ ok: true }>("PATCH", `/api/funnels/${encodeURIComponent(funnelId)}/deals/${encodeURIComponent(dealId)}`, input),
  closeDeal: (funnelId: string, dealId: string, input: DealCloseInput) =>
    sendJson<{ ok: true }>("POST", `/api/funnels/${encodeURIComponent(funnelId)}/deals/${encodeURIComponent(dealId)}/close`, input),
  reopenDeal: (funnelId: string, dealId: string) =>
    sendJson<{ ok: true }>("POST", `/api/funnels/${encodeURIComponent(funnelId)}/deals/${encodeURIComponent(dealId)}/reopen`, {}),
  removeDeal: (funnelId: string, dealId: string) =>
    sendJson<{ ok: true }>("DELETE", `/api/funnels/${encodeURIComponent(funnelId)}/deals/${encodeURIComponent(dealId)}`, {}),
  connection: () => getJson<{ connection: ConnectionState }>("/api/connection"),
  /** Só admin: consulta a Uazapi e devolve o QR code atual. */
  connectionStatus: () => getJson<ConnectionWithQr>("/api/connection/status"),
  /** Só admin: dados da Uazapi guardados (endereço, fim do admin token, instância em uso; nenhum token inteiro volta). */
  uazapiConfig: () => getJson<UazapiConfigSummary>("/api/admin/uazapi"),
  /** Só admin: grava endereço e admin token. Admin token vazio mantém o atual. Rejeita com `code` quando recusado (400). */
  saveUazapiConfig: (baseUrl: string, adminToken: string) => adminCall<UazapiConfigSummary>("PUT", "/api/admin/uazapi", { baseUrl, adminToken }),
  /** Só admin: instâncias do servidor (sem tokens). */
  uazapiInstances: () => adminCall<{ instances: UazapiInstanceItem[] }>("GET", "/api/admin/uazapi/instances"),
  /** Só admin: usa esta instância (o servidor pega o token dela; aqui só vai o id). */
  chooseUazapiInstance: (id: string) => adminCall<UazapiConfigSummary>("PUT", "/api/admin/uazapi/instance", { id }),
  /** Só admin: cria uma instância pelo nome e já a usa. */
  createUazapiInstance: (name: string) => adminCall<UazapiConfigSummary>("POST", "/api/admin/uazapi/instances", { name }),
  /** Só admin: inicia o pareamento. */
  connect: () => sendJson<ConnectionWithQr>("POST", "/api/connection/connect", {}),
  conversation: (id: string) => getJson<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}`),
  messages: (id: string, before?: string) => {
    const qs = before ? `?before=${encodeURIComponent(before)}` : "";
    return getJson<{ messages: Message[]; nextBefore: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages${qs}`,
    );
  },
  /** Janela do histórico centrada numa mensagem (resultado de busca). */
  messagesAround: (id: string, messageId: string) =>
    getJson<{ messages: Message[]; nextBefore: string | null; nextAfter: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?around=${encodeURIComponent(messageId)}`,
    ),
  messagesNewer: (id: string, after: string) =>
    getJson<{ messages: Message[]; nextAfter: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?after=${encodeURIComponent(after)}`,
    ),
  /** Nova conversa: contato existente ou número digitado. O erro traz o `code` da API (ex.: `numero_invalido`). */
  startConversation: async (input: { contactId: string; text: string } | { phone: string; text: string }) => {
    const res = await fetch("/api/conversations/start", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw Object.assign(new ApiError(res.status), { code: body.error });
    }
    return (await res.json()) as { conversation: Conversation; message: Message; created: boolean };
  },
  search: (q: string) => getJson<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
  /** Mensagens depois da última vista (ressincronização ao reconectar). */
  messagesAfter: (id: string, last: Message) => {
    const qs = `?after=${encodeURIComponent(`${last.timestamp}:${last.id}`)}`;
    return getJson<{ messages: Message[]; nextBefore: string | null }>(
      `/api/conversations/${encodeURIComponent(id)}/messages${qs}`,
    );
  },
};

export interface SearchResults {
  contacts: Conversation[];
  messages: {
    messageId: string;
    conversationId: string;
    contact: Conversation["contact"];
    /** Trecho com o termo entre \u0001 e \u0002. */
    snippet: string;
    timestamp: number;
  }[];
}
