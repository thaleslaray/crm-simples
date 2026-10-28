import { describe, expect, it } from "vitest";
import { signIn } from "./helpers/api";
import {
  assume,
  conversationWithClient,
  events,
  history,
  inbox,
  resolve,
  sendText,
  startConversation,
  type HistoryMessage,
  type InboxConversation,
} from "./helpers/conversations";
import { connectRealtime } from "./helpers/realtime";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { ficha } from "./helpers/ficha";
import { loginAsAtendente } from "./helpers/session";
import { createUser } from "./helpers/users";

const SEND = "/send/text";

type Started = { conversation: InboxConversation; message: HistoryMessage; created: boolean };
const started = async (res: Response) => (await res.json()) as Started;

async function loginAsAna(email = "ana@exemplo.com", name = "Ana") {
  await createUser({ email, password: "senha-segura-123", name, role: "atendente" });
  return (await signIn(email, "senha-segura-123")).cookie;
}

describe("Nova conversa", () => {
  const uazapi = fakeUazapi();

  it("número novo cria o contato e a conversa, envia a mensagem e deixa o atendente como responsável", async () => {
    const cookie = await loginAsAna();
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N1", messageid: "N1" } }]);

    const res = await startConversation(cookie, { phone: "5511988887777", text: "Olá, tudo bem?" });

    expect(res.status).toBe(201);
    const body = await started(res);
    expect(body.created).toBe(true);
    expect(body.message).toMatchObject({ direction: "out", text: "Olá, tudo bem?", status: "sent", authorName: "Ana" });
    expect(body.conversation).toMatchObject({ assigneeName: "Ana", contact: { phone: "5511988887777" } });
    expect(await uazapi.calls()).toMatchObject([
      { method: "POST", path: SEND, body: { number: "5511988887777", text: "*Ana:*\nOlá, tudo bem?" } },
    ]);
    expect((await inbox(cookie)).find((c) => c.contact.phone === "5511988887777")).toMatchObject({
      id: body.conversation.id,
      assigneeName: "Ana",
    });
  });

  it("aceita o número com máscara e código do país", async () => {
    const cookie = await loginAsAna();
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N2" } }]);

    const res = await startConversation(cookie, { phone: "+55 (11) 98888-7777", text: "oi" });

    expect((await started(res)).conversation.contact.phone).toBe("5511988887777");
  });

  it("número sem código do país ganha o 55", async () => {
    const cookie = await loginAsAna();
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N3" } }]);

    const res = await startConversation(cookie, { phone: "(21) 97777-6666", text: "oi" });

    expect((await started(res)).conversation.contact.phone).toBe("5521977776666");
    expect(await uazapi.calls()).toMatchObject([{ body: { number: "5521977776666" } }]);
  });

  it("número inválido é recusado antes do envio, sem criar contato", async () => {
    const cookie = await loginAsAna();

    for (const phone of ["abc", "123", "", "55119999", "1234567890123456", "5511 98888-77x7"]) {
      const res = await startConversation(cookie, { phone, text: "oi" });
      expect(res.status, phone).toBe(400);
      expect(await res.json()).toMatchObject({ error: "numero_invalido" });
    }

    expect(await uazapi.calls()).toEqual([]);
    expect(await inbox(cookie)).toEqual([]);
  });

  it("texto vazio é recusado e nada é criado", async () => {
    const cookie = await loginAsAna();

    const res = await startConversation(cookie, { phone: "5511988887777", text: "   " });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "texto_invalido" });
    expect(await inbox(cookie)).toEqual([]);
  });

  it("número que já é contato usa a conversa existente, sem duplicar", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie, "5511900000010");
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N4" } }]);

    const res = await startConversation(cookie, { phone: "11 90000-0010", text: "Retomando" });

    expect(res.status).toBe(201);
    const body = await started(res);
    expect(body.created).toBe(false);
    expect(body.conversation.id).toBe(conversa);
    expect((await inbox(cookie)).filter((c) => c.contact.phone === "5511900000010")).toHaveLength(1);
    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ direction: "out", text: "Retomando" });
  });

  it("a partir da ficha: contato por id, e conversa resolvida volta ao atendente que iniciou", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie, "5511900000011");
    await resolve(cookie, conversa);
    const contactId = (await inbox(cookie)).find((c) => c.id === conversa)!.contact.id;
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N5" } }]);

    const res = await startConversation(cookie, { contactId, text: "Voltei a falar" });

    expect(res.status).toBe(201);
    const body = await started(res);
    expect(body.conversation).toMatchObject({ id: conversa, assigneeName: "Ana", status: "aguardando_cliente" });
    expect((await ficha(cookie, contactId)).conversations).toHaveLength(1);
  });

  it("a conversa nova avisa o tempo real com o evento de quem assumiu", async () => {
    const ana = await loginAsAna();
    const bia = await loginAsAna("bia@exemplo.com", "Bia");
    const conn = await connectRealtime(bia);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N8" } }]);

    await startConversation(ana, { phone: "5511988880001", text: "Olá" });

    expect(await conn.next()).toMatchObject({
      type: "conversation.updated",
      conversation: { status: "em_andamento", assigneeName: "Ana" },
      event: { type: "assumida", actorName: "Ana" },
    });
    conn.close();
  });

  it("reabrir uma resolvida de outro atendente avisa o tempo real e registra reabertura e troca de responsavel", async () => {
    const ana = await loginAsAna();
    const bia = await loginAsAna("bia@exemplo.com", "Bia");
    const conversa = await conversationWithClient(ana, "5511900000013");
    await assume(ana, conversa);
    await resolve(ana, conversa);
    const conn = await connectRealtime(ana);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N9" } }]);

    await startConversation(bia, { phone: "5511900000013", text: "Oi, é a Bia" });

    expect(await conn.next()).toMatchObject({ type: "conversation.updated", event: { type: "reaberta", actorName: "Bia" } });
    expect(await events(ana, conversa)).toMatchObject([
      { type: "assumida" },
      { type: "resolvida" },
      { type: "reaberta", actorName: "Bia" },
      { type: "transferida", actorName: "Bia", fromName: "Ana", toName: "Bia" },
    ]);
    expect((await inbox(ana)).find((c) => c.id === conversa)).toMatchObject({ assigneeName: "Bia", status: "aguardando_cliente" });
    conn.close();
  });

  it("contato inexistente devolve 404", async () => {
    const cookie = await loginAsAna();

    const res = await startConversation(cookie, { contactId: "nao-existe", text: "oi" });

    expect(res.status).toBe(404);
  });

  it("se a Uazapi recusar, a conversa fica em andamento com o atendente e a mensagem falhou", async () => {
    const cookie = await loginAsAna();
    await uazapi.program("POST", SEND, [{ status: 400, body: {} }]);

    const res = await startConversation(cookie, { phone: "5511988887777", text: "oi" });

    expect(res.status).toBe(201);
    const body = await started(res);
    expect(body.message.status).toBe("failed");
    expect(body.conversation).toMatchObject({ status: "em_andamento", assigneeName: "Ana" });
  });

  it("conversa de outro atendente: mantém o responsável e só envia", async () => {
    const ana = await loginAsAna();
    const conversa = await conversationWithClient(ana, "5511900000012");
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N6" } }]);
    await sendText(ana, conversa, "Sou a Ana");
    const bia = await loginAsAtendente("bia@exemplo.com");
    await uazapi.program("POST", SEND, [{ body: { id: "owner:N7" } }]);

    const res = await startConversation(bia, { phone: "5511900000012", text: "Oi, é a Bia" });

    expect((await started(res)).conversation.assigneeName).toBe("Ana");
  });

  it("exige sessão", async () => {
    const res = await startConversation("", { phone: "5511988887777", text: "oi" });

    expect(res.status).toBe(401);
  });
});
