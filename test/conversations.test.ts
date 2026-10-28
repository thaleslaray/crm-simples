import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { history, inbox } from "./helpers/conversations";
import { loginAsAtendente } from "./helpers/session";
import { postWebhook, textMessageEvent } from "./helpers/webhook";

/** Cliente `n` manda uma mensagem por vez, em ordem, com texto "m1", "m2"... */
async function enviar(sender: string, textos: string[], t0 = 1_700_000_000_000) {
  for (const [i, text] of textos.entries()) {
    await postWebhook(textMessageEvent({ sender, text, timestamp: t0 + i * 1000, senderName: "Cliente" }));
  }
}

describe("API de conversas: acesso", () => {
  it("as tres rotas exigem login", async () => {
    expect((await api("/api/conversations")).status).toBe(401);
    expect((await api("/api/conversations/qualquer")).status).toBe(401);
    expect((await api("/api/conversations/qualquer/messages")).status).toBe(401);
  });

  it("conversa inexistente responde 404 no detalhe e no historico", async () => {
    const cookie = await loginAsAtendente();
    const detalhe = await api("/api/conversations/nao-existe", { cookie });
    expect(detalhe.status).toBe(404);
    expect(await detalhe.json()).toEqual({ error: "nao_encontrado" });
    expect((await api("/api/conversations/nao-existe/messages", { cookie })).status).toBe(404);
  });
});

describe("API de conversas: caixa de entrada", () => {
  it("conversa nova nasce aberta e sem responsavel", async () => {
    const cookie = await loginAsAtendente();
    await enviar("5511900000001@s.whatsapp.net", ["oi"]);
    const [conversa] = await inbox(cookie);
    expect(conversa).toMatchObject({ status: "aberta", assigneeId: null });
  });

  it("ordena pela conversa com mensagem mais recente primeiro", async () => {
    const cookie = await loginAsAtendente();
    await enviar("5511900000001@s.whatsapp.net", ["antiga"], 1_700_000_000_000);
    await enviar("5511900000002@s.whatsapp.net", ["nova"], 1_700_000_500_000);
    await enviar("5511900000001@s.whatsapp.net", ["a mais recente de todas"], 1_700_001_000_000);

    const conversas = await inbox(cookie);
    expect(conversas.map((c) => c.contact.phone)).toEqual(["5511900000001", "5511900000002"]);
    expect(conversas[0]!.lastMessage!.text).toBe("a mais recente de todas");
  });

  it("detalhe devolve a mesma conversa da caixa", async () => {
    const cookie = await loginAsAtendente();
    await enviar("5511900000001@s.whatsapp.net", ["oi"]);
    const [conversa] = await inbox(cookie);
    const res = await api(`/api/conversations/${conversa!.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation: conversa });
  });
});

describe("API de conversas: historico paginado", () => {
  const CLIENTE = "5511900000003@s.whatsapp.net";
  const textos = Array.from({ length: 5 }, (_, i) => `m${i + 1}`);

  it("devolve as mensagens mais recentes em ordem cronologica", async () => {
    const cookie = await loginAsAtendente();
    await enviar(CLIENTE, textos);
    const [conversa] = await inbox(cookie);

    const pagina = await history(cookie, conversa!.id, "?limit=3");
    expect(pagina.messages.map((m) => m.text)).toEqual(["m3", "m4", "m5"]);
    expect(pagina.messages[0]).toMatchObject({ direction: "in", type: "text" });
    expect(pagina.nextBefore).not.toBeNull();
  });

  it("before carrega a pagina mais antiga e nextBefore fica nulo no fim", async () => {
    const cookie = await loginAsAtendente();
    await enviar(CLIENTE, textos);
    const [conversa] = await inbox(cookie);

    const primeira = await history(cookie, conversa!.id, "?limit=3");
    const segunda = await history(cookie, conversa!.id, `?limit=3&before=${encodeURIComponent(primeira.nextBefore!)}`);
    expect(segunda.messages.map((m) => m.text)).toEqual(["m1", "m2"]);
    expect(segunda.nextBefore).toBeNull();
  });

  it("nextBefore e nulo quando tudo cabe numa pagina so", async () => {
    const cookie = await loginAsAtendente();
    await enviar(CLIENTE, textos);
    const [conversa] = await inbox(cookie);
    const pagina = await history(cookie, conversa!.id);
    expect(pagina.messages).toHaveLength(5);
    expect(pagina.nextBefore).toBeNull();
  });

  it("mensagens com o mesmo horario nao se perdem nem repetem entre paginas", async () => {
    const cookie = await loginAsAtendente();
    for (const text of ["a", "b", "c", "d"]) {
      await postWebhook(textMessageEvent({ sender: CLIENTE, text, timestamp: 1_700_000_000_000 }));
    }
    const [conversa] = await inbox(cookie);
    const p1 = await history(cookie, conversa!.id, "?limit=2");
    const p2 = await history(cookie, conversa!.id, `?limit=2&before=${encodeURIComponent(p1.nextBefore!)}`);
    const todos = [...p2.messages, ...p1.messages].map((m) => m.text).sort();
    expect(todos).toEqual(["a", "b", "c", "d"]);
    expect(p2.nextBefore).toBeNull();
  });

  it("limit acima de 100 e limitado a 100", async () => {
    const cookie = await loginAsAtendente();
    await enviar(CLIENTE, Array.from({ length: 105 }, (_, i) => `x${i}`));
    const [conversa] = await inbox(cookie);
    const pagina = await history(cookie, conversa!.id, "?limit=500");
    expect(pagina.messages).toHaveLength(100);
    expect(pagina.nextBefore).not.toBeNull();
  });
});
