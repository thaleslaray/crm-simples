import { describe, expect, it } from "vitest";
import { signIn } from "./helpers/api";
import { conversationWithClient, history, resend, sendText, setSignature, type HistoryMessage } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { connectRealtime } from "./helpers/realtime";
import { loginAsAtendente } from "./helpers/session";
import { createUser } from "./helpers/users";

const SEND = "/send/text";

async function loginAsAna() {
  await createUser({ email: "ana@exemplo.com", password: "senha-segura-123", name: "Ana", role: "atendente" });
  return (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
}

const messageOf = async (res: Response) => ((await res.json()) as { message: HistoryMessage }).message;

describe("Responder com texto", () => {
  const uazapi = fakeUazapi();

  it("envia a resposta com o nome do atendente no início e grava como enviada", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT1", messageid: "OUT1" } }]);

    const res = await sendText(cookie, conversa, "Bom dia!");

    expect(res.status).toBe(201);
    expect(await messageOf(res)).toMatchObject({ direction: "out", type: "text", text: "Bom dia!", status: "sent", authorName: "Ana" });
    expect(await uazapi.calls()).toMatchObject([
      { method: "POST", path: SEND, body: { number: "5511900000010", text: "*Ana:*\nBom dia!" } },
    ]);
    const { messages } = await history(cookie, conversa);
    expect(messages.at(-1)).toMatchObject({ direction: "out", text: "Bom dia!", status: "sent" });
  });

  it("devolve o id de quem enviou, no envio e no histórico, para o cliente dar cor estável ao autor", async () => {
    const ana = await createUser({ email: "ana@exemplo.com", password: "senha-segura-123", name: "Ana", role: "atendente" });
    const cookie = (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUTID" } }]);

    const res = await sendText(cookie, conversa, "Oi!");

    expect(await messageOf(res)).toMatchObject({ sentById: ana });
    const { messages } = await history(cookie, conversa);
    expect(messages.at(-1)).toMatchObject({ direction: "out", sentById: ana });
    expect(messages[0]).toMatchObject({ direction: "in", sentById: null });
  });

  it("envia sem o nome quando o atendente desligou a assinatura", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT2" } }]);

    expect((await setSignature(cookie, false)).status).toBe(200);
    await sendText(cookie, conversa, "Sem nome");

    expect(await uazapi.calls()).toMatchObject([{ body: { text: "Sem nome" } }]);
  });

  it("religar a assinatura volta a prefixar", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT3" } }]);

    await setSignature(cookie, false);
    await setSignature(cookie, true);
    await sendText(cookie, conversa, "De novo");

    expect(await uazapi.calls()).toMatchObject([{ body: { text: "*Ana:*\nDe novo" } }]);
  });

  it("recusa da Uazapi vira falhou, e o reenvio manual entrega", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ status: 400, body: { error: "numero invalido" } }]);

    const failed = await messageOf(await sendText(cookie, conversa, "Oi"));
    expect(failed.status).toBe("failed");
    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ text: "Oi", status: "failed" });

    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT5" } }]);
    const res = await resend(cookie, conversa, failed.id);

    expect(await messageOf(res)).toMatchObject({ id: failed.id, status: "sent" });
    expect(await uazapi.calls()).toHaveLength(2);
    expect((await history(cookie, conversa)).messages.filter((m) => m.direction === "out")).toHaveLength(1);
  });

  it("timeout vira incerto, não é reenviado sozinho e não aceita reenvio", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ delayMs: 1500, body: { id: "owner:LATE" } }]);

    const incerta = await messageOf(await sendText(cookie, conversa, "Demorou"));

    expect(incerta.status).toBe("uncertain");
    await new Promise((r) => setTimeout(r, 2000));
    expect(await uazapi.calls()).toHaveLength(1);
    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ status: "uncertain" });
    expect((await resend(cookie, conversa, incerta.id)).status).toBe(409);
    expect(await uazapi.calls()).toHaveLength(1);
  });

  it("429 espera o Retry-After e tenta de novo", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [
      { status: 429, headers: { "Retry-After": "1" }, body: { error: "rate" } },
      { body: { id: "owner:OUT4" } },
    ]);

    const t0 = Date.now();
    const res = await sendText(cookie, conversa, "Depois do limite");

    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
    expect((await messageOf(res)).status).toBe("sent");
    expect(await uazapi.calls()).toHaveLength(2);
  });

  it("outra sessão conectada recebe a mensagem enviada em tempo real, já com o estado final", async () => {
    const ana = await loginAsAna();
    const conversa = await conversationWithClient(ana);
    const outra = await connectRealtime(await loginAsAtendente("outra@exemplo.com"));
    await uazapi.program("POST", SEND, [{ body: { id: "owner:RT1" } }]);

    await sendText(ana, conversa, "Já te respondo");

    // A primeira resposta torna Ana responsável (conversa.updated) antes do aviso da mensagem.
    expect(await outra.next()).toMatchObject({ type: "conversation.updated" });
    expect(await outra.next()).toMatchObject({
      type: "message.created",
      conversation: { id: conversa, lastMessage: { type: "text", text: "Já te respondo" } },
      message: { direction: "out", text: "Já te respondo", status: "sent", authorName: "Ana" },
    });
    outra.close();
  });

  it("exige login, conversa existente e texto não vazio", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    expect((await sendText("", conversa, "x")).status).toBe(401);
    expect((await sendText(cookie, "nao-existe", "x")).status).toBe(404);
    expect((await sendText(cookie, conversa, "   ")).status).toBe(400);
    expect(await uazapi.calls()).toHaveLength(0);
  });
});
