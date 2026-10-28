import { describe, expect, it } from "vitest";
import { signIn } from "./helpers/api";
import { conversationWithClient, history, resend, sendText, type HistoryMessage } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { createUser } from "./helpers/users";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

const SEND = "/send/text";

async function loginAsAna() {
  await createUser({ email: "ana@exemplo.com", password: "senha-segura-123", name: "Ana", role: "atendente" });
  return (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
}

const messageOf = async (res: Response) => ((await res.json()) as { message: HistoryMessage }).message;

describe("Responder citando", () => {
  const uazapi = fakeUazapi();

  it("envia a resposta com o replyid da mensagem do cliente e devolve a citação", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    const original = (await history(cookie, conversa)).messages[0]!;
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT10", messageid: "OUT10" } }]);

    const res = await sendText(cookie, conversa, "Já verifico", original.id);

    expect(res.status).toBe(201);
    expect(await uazapi.calls()).toMatchObject([{ path: SEND, body: { text: "*Ana:*\nJá verifico", replyid: expect.any(String) } }]);
    expect(await messageOf(res)).toMatchObject({ quote: { id: original.id, text: "oi", direction: "in" } });
    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ quote: { id: original.id, text: "oi" } });
  });

  it("recusa citar mensagem que não existe na conversa, sem chamar a Uazapi", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    const outra = await conversationWithClient(cookie, "5511900000011");
    const deOutra = (await history(cookie, outra)).messages[0]!;

    expect((await sendText(cookie, conversa, "x", "nao-existe")).status).toBe(400);
    expect((await sendText(cookie, conversa, "x", deOutra.id)).status).toBe(400);
    expect(await uazapi.calls()).toHaveLength(0);
  });

  it("o reenvio de uma resposta que falhou mantém a citação", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    const original = (await history(cookie, conversa)).messages[0]!;
    await uazapi.program("POST", SEND, [{ status: 400, body: { error: "recusado" } }]);
    const failed = await messageOf(await sendText(cookie, conversa, "Oi", original.id));
    expect(failed.status).toBe("failed");
    const firstReplyId = ((await uazapi.calls())[0]!.body as { replyid: string }).replyid;

    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT11" } }]);
    expect((await resend(cookie, conversa, failed.id)).status).toBe(200);

    expect(((await uazapi.calls()).at(-1)!.body as { replyid: string }).replyid).toBe(firstReplyId);
  });

  it("mensagem recebida que cita outra mostra o trecho citado", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:OUT12", messageid: "OUT12" } }]);
    await sendText(cookie, conversa, "Qual o seu CPF?");

    await postWebhook(textMessageEvent({ sender: "5511900000010@s.whatsapp.net", text: "123", quoted: "OUT12", timestamp: Date.now() + 1000 }));

    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({
      text: "123",
      quote: { text: "Qual o seu CPF?", direction: "out", authorName: "Ana" },
    });
  });

  it("citação de mensagem fora do histórico não quebra a conversa", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);

    await postWebhook(textMessageEvent({ sender: "5511900000010@s.whatsapp.net", text: "sobre aquilo", quoted: "owner:ANTIGA", timestamp: Date.now() + 1000 }));

    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ text: "sobre aquilo", quote: null });
  });
});
