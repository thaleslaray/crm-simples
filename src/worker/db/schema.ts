// Esquema D1 (Drizzle). Tabelas user/session/account/verification seguem o contrato do Better Auth;
// `role` e `signatureEnabled` sao campos adicionais do usuario (declarados tambem em auth.ts).
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ROLES = ["admin", "atendente"] as const;
export type Role = (typeof ROLES)[number];

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  /** Papel do membro: verificado no servidor (middleware requireRole). */
  role: text("role", { enum: ROLES }).notNull().default("atendente"),
  /** Preferencia: prefixar mensagens enviadas com `*Nome:*` (ligada por padrao). Editavel no perfil. */
  signatureEnabled: integer("signature_enabled", { mode: "boolean" }).notNull().default(true),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Contador de tentativas do Better Auth (rateLimit.storage "database"): em Workers cada requisicao pode cair num isolate novo, entao memoria nao serve. */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

/** Link de uso unico com validade (ticket 06): convite (define o papel) ou redefinicao de senha (aponta o membro). So o hash do token e gravado. */
export const ACCESS_LINK_KINDS = ["convite", "redefinicao"] as const;
export type AccessLinkKind = (typeof ACCESS_LINK_KINDS)[number];

export const accessLink = sqliteTable(
  "access_link",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ACCESS_LINK_KINDS }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** So convite: papel que o convidado recebe. */
    role: text("role", { enum: ROLES }),
    /** So redefinicao: o membro que troca a senha. Sai junto com o membro removido. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (t) => [index("access_link_user_idx").on(t.userId)],
);

// ---- Conexao do numero (ticket 18) ----

export const CONNECTION_STATUSES = ["connected", "connecting", "disconnected"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Estado da conexao do numero: uma unica linha (id "instance"). Sem linha = ainda desconhecido. */
export const connectionState = sqliteTable("connection_state", {
  id: text("id").primaryKey(),
  status: text("status", { enum: CONNECTION_STATUSES }).notNull(),
  /** `type` do evento connection (Disconnected, TemporaryBan). */
  disconnectType: text("disconnect_type"),
  lastDisconnectReason: text("last_disconnect_reason"),
  updatedAt: integer("updated_at").notNull(),
});

/** Configuracao da empresa: uma unica linha (id "workspace"). Sem linha = nome padrao. */
export const workspaceSetting = sqliteTable("workspace_setting", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Segredos gerados pelo proprio CRM (uma unica linha, id "instance"): o do login e o do endereco do webhook.
 * So valem quando nao ha o segredo equivalente no ambiente da Cloudflare (ver instance-secrets.ts).
 */
export const instanceSecret = sqliteTable("instance_secret", {
  id: text("id").primaryKey(),
  authSecret: text("auth_secret").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Dados da Uazapi informados pela tela (uma unica linha, id "instance"). O token fica cifrado (AES-GCM, ver uazapi/config.ts). */
export const uazapiSetting = sqliteTable("uazapi_setting", {
  id: text("id").primaryKey(),
  baseUrl: text("base_url").notNull(),
  /** `iv.cifrado` em base64. Nunca devolvido pela API. */
  tokenEnc: text("token_enc").notNull(),
  /** Ultimos 4 caracteres do token, so para o admin reconhecer qual esta salvo. */
  tokenLast4: text("token_last4").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Acesso admin da Uazapi (uma unica linha, id "admin"): endereco, admin token e a instancia escolhida.
 * Tokens cifrados (AES-GCM, ver uazapi/config.ts); nada daqui volta ao navegador alem dos 4 ultimos do admin token.
 */
export const uazapiAdmin = sqliteTable("uazapi_admin", {
  id: text("id").primaryKey(),
  baseUrl: text("base_url").notNull(),
  adminTokenEnc: text("admin_token_enc").notNull(),
  adminTokenLast4: text("admin_token_last4").notNull(),
  instanceId: text("instance_id"),
  instanceName: text("instance_name"),
  instanceTokenEnc: text("instance_token_enc"),
  updatedAt: integer("updated_at").notNull(),
});

/** Reconciliacao (ticket 19): uma unica linha (id "inbox") com o inicio da ultima conferencia bem-sucedida. */
export const reconciliationState = sqliteTable("reconciliation_state", {
  id: text("id").primaryKey(),
  lastRunAt: integer("last_run_at").notNull(),
});

// ---- Caixa de entrada (ticket 02) ----

export const CONVERSATION_STATUSES = ["aberta", "em_andamento", "aguardando_cliente", "resolvida"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export const MESSAGE_TYPES = ["text", "image", "video", "audio", "voice", "document", "sticker", "location", "contact", "unsupported"] as const;
export const MEDIA_STATUSES = ["pending", "available", "failed"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
/**
 * Estado das mensagens do atendente: sending (gravada, aguardando a Uazapi), sent, failed (recusa), uncertain (timeout);
 * depois, pelo webhook `messages_update`: delivered, read, played.
 */
export const SEND_STATUSES = ["sending", "sent", "delivered", "read", "played", "failed", "uncertain"] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

/** Evento cru do webhook, gravado antes de qualquer processamento. `processedAt` nulo = nao processado. */
export const webhookEvent = sqliteTable(
  "webhook_event",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type"),
    /** Corpo cru (JSON em texto) SEM o campo `token`. */
    payload: text("payload").notNull(),
    receivedAt: integer("received_at").notNull(),
    processedAt: integer("processed_at"),
  },
  (t) => [index("webhook_event_pending_idx").on(t.processedAt)],
);

export const contact = sqliteTable(
  "contact",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    /** So digitos (ex.: 5511999990001). Nulo quando so se conhece o LID. */
    phone: text("phone").unique(),
    jidPn: text("jid_pn").unique(),
    jidLid: text("jid_lid").unique(),
    createdAt: integer("created_at").notNull(),
    /** Campos editaveis da ficha (ticket 11). */
    email: text("email"),
    company: text("company"),
    notes: text("notes"),
    /** Foto de perfil: URL temporaria da Uazapi e quando foi buscada (renovada quando velha ou quebrada). */
    avatarUrl: text("avatar_url"),
    avatarFetchedAt: integer("avatar_fetched_at"),
  },
);

export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    /** Uma conversa por contato. */
    contactId: text("contact_id")
      .notNull()
      .unique()
      .references(() => contact.id, { onDelete: "cascade" }),
    status: text("status", { enum: CONVERSATION_STATUSES }).notNull().default("aberta"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    lastMessageAt: integer("last_message_at"),
    lastMessageId: text("last_message_id"),
    /** Mensagens do cliente ainda nao vistas; zerado ao abrir a conversa. */
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("conversation_last_message_at_idx").on(t.lastMessageAt)],
);

/** Resposta rapida compartilhada pela equipe: atalho (gravado em minusculas, unico) e texto com `{nome}`. */
export const quickReply = sqliteTable("quick_reply", {
  id: text("id").primaryKey(),
  shortcut: text("shortcut").notNull().unique(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    /** `message.id` da Uazapi (chave de idempotencia). Nulo enquanto a mensagem enviada ainda nao tem id. */
    externalId: text("external_id").unique(),
    /** `message.messageid` do WhatsApp. */
    whatsappMessageId: text("whatsapp_message_id"),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    /** So mensagens de saida. */
    status: text("status", { enum: SEND_STATUSES }),
    /** Atendente que enviou (so saida). */
    sentById: text("sent_by_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type", { enum: MESSAGE_TYPES }).notNull(),
    text: text("text"),
    timestamp: integer("timestamp").notNull(),
    /** Midia (imagem, video, audio, voz, documento, figurinha): nulo nas demais. "expirada" nao e gravado: sai do R2. */
    mediaStatus: text("media_status", { enum: MEDIA_STATUSES }),
    /** Chave do objeto no R2 (so quando disponivel). */
    mediaKey: text("media_key"),
    mediaMime: text("media_mime"),
    mediaSize: integer("media_size"),
    mediaName: text("media_name"),
    /** Localizacao e contato recebidos: JSON `{lat,lng,name,address}` ou `{name,vcard}`. */
    extra: text("extra"),
    /** `messageid` do WhatsApp da mensagem citada (resposta com citacao, de entrada ou saida). */
    quotedId: text("quoted_id"),
  },
  (t) => [
    index("message_conversation_ts_idx").on(t.conversationId, t.timestamp, t.id),
    // Parcial: so as pendentes entram, a reconciliacao acha as presas sem varrer a tabela.
    index("message_media_pending_idx").on(t.timestamp).where(sql`${t.mediaStatus} = 'pending'`),
  ],
);

/** Eventos de sistema da linha do tempo: quem mudou o status/responsavel e quando (o vaivem automatico nao entra). */
export const EVENT_TYPES = ["assumida", "atribuida", "transferida", "resolvida", "reaberta", "devolvida"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const conversationEvent = sqliteTable(
  "conversation_event",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    type: text("type", { enum: EVENT_TYPES }).notNull(),
    /** Quem fez; nulo quando foi o cliente (reabertura). */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Responsavel depois do evento (assumida, atribuida, transferida). */
    toUserId: text("to_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Responsavel antes (transferida). */
    fromUserId: text("from_user_id").references(() => user.id, { onDelete: "set null" }),
    timestamp: integer("timestamp").notNull(),
  },
  (t) => [index("conversation_event_conv_ts_idx").on(t.conversationId, t.timestamp)],
);

/** Nota interna: so da equipe, aparece na linha do tempo da conversa e na ficha. Nunca vai para a Uazapi. */
export const conversationNote = sqliteTable(
  "conversation_note",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("conversation_note_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Etiqueta (ticket 14): nome + cor, criada pelo admin. O nome e unico sem diferenciar maiusculas. */
export const label = sqliteTable(
  "label",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Cor em hex `#rrggbb`. */
    color: text("color").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("label_name_nocase_idx").on(sql`lower(${t.name})`)],
);

/** Etiquetas aplicadas ao contato. Apagar a etiqueta (ou o contato) apaga a ligacao. */
export const contactLabel = sqliteTable(
  "contact_label",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => label.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.labelId] }), index("contact_label_label_idx").on(t.labelId)],
);

/** Funil (ticket 15): um quadro kanban com etapas ordenadas, criado pelo admin. */
export const funnel = sqliteTable("funnel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Etapa do funil; `position` e a ordem das colunas (0, 1, 2...). */
export const funnelStage = sqliteTable(
  "funnel_stage",
  {
    id: text("id").primaryKey(),
    funnelId: text("funnel_id")
      .notNull()
      .references(() => funnel.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("funnel_stage_funnel_idx").on(t.funnelId, t.position)],
);

/** Card = (contato, funil, etapa). No maximo um por contato em cada funil; `position` e a ordem dentro da etapa. */
export const funnelCard = sqliteTable(
  "funnel_card",
  {
    funnelId: text("funnel_id")
      .notNull()
      .references(() => funnel.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => funnelStage.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.funnelId, t.contactId] }),
    index("funnel_card_stage_idx").on(t.stageId, t.position),
    index("funnel_card_contact_idx").on(t.contactId),
  ],
);
