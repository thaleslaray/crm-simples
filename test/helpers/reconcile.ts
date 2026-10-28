import type { fakeUazapi } from "./fake-uazapi";
import { type TextMessageInput, textMessageEvent } from "./webhook";

type RecentMessage = ReturnType<typeof textMessageEvent>["message"];

/** Programa `/message/find` da Uazapi falsa: as mensagens que ela "tem", no formato do evento `messages`. */
export async function programRecentMessages(uazapi: ReturnType<typeof fakeUazapi>, messages: RecentMessage[]) {
  await uazapi.program("POST", "/message/find", [{ body: { messages, hasMore: false } }]);
}

/** Mensagem de texto de um cliente como a busca da Uazapi a devolve (sem o envelope do webhook). */
export const recentTextMessage = (input: TextMessageInput = {}): RecentMessage => textMessageEvent({ timestamp: Date.now(), ...input }).message;
