import { describe, expect, it } from "vitest";
import { shouldAlert, type AlertableEvent } from "../src/shared/alerts";
import { signIn } from "./helpers/api";
import { assume, clientWritesAgain, conversationWithClient, sendText } from "./helpers/conversations";
import { connectRealtime, type RealtimeConnection } from "./helpers/realtime";
import { createUser } from "./helpers/users";

async function login(email: string, name: string) {
  const id = await createUser({ email, password: "senha-segura-123", name, role: "atendente" });
  return { id, cookie: (await signIn(email, "senha-segura-123")).cookie };
}

/** Proximo evento "message.created" da conexao (ignora os demais). */
async function nextMessage(conn: RealtimeConnection): Promise<AlertableEvent> {
  for (;;) {
    const event = (await conn.next()) as AlertableEvent;
    if (event.type === "message.created") return event;
  }
}

describe("Avisos: quem recebe som e notificacao", () => {
  it("mensagem do cliente numa conversa sem responsavel avisa todos os atendentes", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const daAna = await connectRealtime(ana.cookie);
    const doBeto = await connectRealtime(beto.cookie);

    await conversationWithClient(ana.cookie);

    expect(shouldAlert(await nextMessage(daAna), ana.id)).toBe(true);
    expect(shouldAlert(await nextMessage(doBeto), beto.id)).toBe(true);
  });

  it("numa conversa com responsavel, avisa so ele", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const beto = await login("beto@exemplo.com", "Beto");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    const daAna = await connectRealtime(ana.cookie);
    const doBeto = await connectRealtime(beto.cookie);

    await clientWritesAgain();

    expect(shouldAlert(await nextMessage(daAna), ana.id)).toBe(true);
    expect(shouldAlert(await nextMessage(doBeto), beto.id)).toBe(false);
  });

  it("mensagem enviada pela equipe nao avisa ninguem", async () => {
    const ana = await login("ana@exemplo.com", "Ana");
    const conversa = await conversationWithClient(ana.cookie);
    await assume(ana.cookie, conversa);
    const daAna = await connectRealtime(ana.cookie);

    await sendText(ana.cookie, conversa, "ja te respondo");

    expect(shouldAlert(await nextMessage(daAna), ana.id)).toBe(false);
  });
});
