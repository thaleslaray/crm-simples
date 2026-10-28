// Esquema D1 (Drizzle). Tabelas user/session/account/verification seguem o contrato do Better Auth;
// `role` e `signatureEnabled` sao campos adicionais do usuario (declarados tambem em auth.ts).
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  /** Preferencia: prefixar mensagens enviadas com `*Nome:*` (ligada por padrao). So o campo; sem tela ainda. */
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

// ---- Caixa de entrada (ticket 02) ----

export const CONVERSATION_STATUSES = ["aberta"] as const; // em_andamento/resolvida entram nos tickets de status
export const MESSAGE_TYPES = ["text", "image", "video", "audio", "voice", "document", "sticker", "location", "contact", "unsupported"] as const;
export const MEDIA_STATUSES = ["pending", "available", "failed"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];

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
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("conversation_last_message_at_idx").on(t.lastMessageAt)],
);

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    /** `message.id` da Uazapi (chave de idempotencia). */
    externalId: text("external_id").notNull().unique(),
    /** `message.messageid` do WhatsApp. */
    whatsappMessageId: text("whatsapp_message_id"),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in"] }).notNull(),
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
  },
  (t) => [index("message_conversation_ts_idx").on(t.conversationId, t.timestamp, t.id)],
);
