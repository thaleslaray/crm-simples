import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { history, inbox } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { deliverMediaJob, fetchMedia, programDownload } from "./helpers/media";
import { loginAsAtendente } from "./helpers/session";
import { contactMessageEvent, locationMessageEvent, mediaMessageEvent, postWebhook } from "./helpers/webhook";

const uazapi = fakeUazapi();

/** Cliente manda uma midia; devolve o cookie, o id da mensagem e uma leitura do historico. */
async function receberMidia(input: Parameters<typeof mediaMessageEvent>[0]) {
  const cookie = await loginAsAtendente();
  expect((await postWebhook(mediaMessageEvent(input))).status).toBe(200);
  const [conversa] = await inbox(cookie);
  const ler = async () => (await history(cookie, conversa!.id)).messages[0]!;
  return { cookie, id: (await ler()).id, ler };
}

describe("midia recebida: ingestao", () => {
  it("imagem com legenda vira mensagem de imagem com midia pendente", async () => {
    const { cookie, ler } = await receberMidia({ kind: "image", caption: "segue o comprovante" });
    const [conversa] = await inbox(cookie);
    expect(conversa!.lastMessage).toMatchObject({ type: "image", text: "segue o comprovante" });
    expect(await ler()).toMatchObject({ type: "image", text: "segue o comprovante", media: { status: "pending", mime: "image/jpeg" } });
  });
});

describe("midia recebida: download pela fila", () => {
  it("baixa pela Uazapi, guarda no R2 e serve ao atendente logado", async () => {
    const { cookie, id, ler } = await receberMidia({ kind: "image", mimetype: "image/jpeg" });
    await programDownload(uazapi, { name: "a.jpg", body: "conteudo-da-imagem", mime: "image/jpeg" });

    const result = await deliverMediaJob(id);
    expect(result.explicitAcks).toEqual(["job1"]);

    const calls = await uazapi.calls();
    expect(calls[0]).toMatchObject({ method: "POST", path: "/message/download", headers: { token: "token-instancia-teste" } });
    expect(await ler()).toMatchObject({ media: { status: "available", mime: "image/jpeg", size: "conteudo-da-imagem".length } });

    const res = await fetchMedia(cookie, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("conteudo-da-imagem");
  });

  it("aceita arquivo com content-length e entrega faixa de bytes para o player de audio", async () => {
    const { cookie, id } = await receberMidia({ kind: "audio", mimetype: "audio/ogg" });
    await uazapi.program("POST", "/message/download", [{ body: { fileURL: `${env.UAZAPI_BASE_URL}/files/a.ogg`, mimetype: "audio/ogg" } }]);
    await uazapi.program("GET", "/files/a.ogg", [{ headers: { "content-type": "audio/ogg", "content-length": "10" }, body: "0123456789" }]);
    await deliverMediaJob(id);

    const res = await fetchMedia(cookie, id, { range: "bytes=2-5" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await res.text()).toBe("2345");
  });

  it("entrega duas vezes o mesmo job baixa uma vez so", async () => {
    const { id } = await receberMidia({ kind: "image" });
    await programDownload(uazapi, { name: "a.jpg", body: "x", mime: "image/jpeg" });
    await deliverMediaJob(id);
    await deliverMediaJob(id);
    expect((await uazapi.calls()).filter((c) => c.path === "/message/download")).toHaveLength(1);
  });

  it("recusa quem nao tem sessao", async () => {
    const { id } = await receberMidia({ kind: "image" });
    await programDownload(uazapi, { name: "a.jpg", body: "x", mime: "image/jpeg" });
    await deliverMediaJob(id);
    expect((await fetchMedia(undefined, id)).status).toBe(401);
  });

  it("documento e arquivo de tipo ativo sempre baixam em vez de abrir", async () => {
    const { cookie, id } = await receberMidia({ kind: "document", mimetype: "text/html", fileName: "boleto.html" });
    await programDownload(uazapi, { name: "b.html", body: "<script>1</script>", mime: "text/html" });
    await deliverMediaJob(id);
    const res = await fetchMedia(cookie, id);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="boleto.html"; filename*=UTF-8''boleto.html`);
    await res.body?.cancel();
  });
});

describe("midia recebida: falhas", () => {
  it("falha temporaria devolve o job para a fila e a midia segue pendente", async () => {
    const { id, ler } = await receberMidia({ kind: "image" });
    await uazapi.program("POST", "/message/download", [{ status: 500 }]);

    const result = await deliverMediaJob(id, 1);
    expect(result.retryMessages).toEqual([{ msgId: "job1" }]);
    expect(result.explicitAcks).toEqual([]);
    expect(await ler()).toMatchObject({ media: { status: "pending" } });
  });

  it("depois de esgotar as tentativas marca falhou e deixa a fila mandar para a DLQ", async () => {
    const { cookie, id, ler } = await receberMidia({ kind: "image" });
    await uazapi.program("POST", "/message/download", [{ status: 500 }]);

    const result = await deliverMediaJob(id, 6);
    expect(result.retryMessages).toEqual([{ msgId: "job1" }]);
    expect(await ler()).toMatchObject({ media: { status: "failed" } });
    expect((await fetchMedia(cookie, id)).status).toBe(404);
  });

  it("midia que saiu do R2 aparece como expirada e a rota responde 410", async () => {
    const { cookie, id, ler } = await receberMidia({ kind: "image" });
    await programDownload(uazapi, { name: "a.jpg", body: "x", mime: "image/jpeg" });
    await deliverMediaJob(id);
    await env.MEDIA.delete(`media/${id}`); // o que a regra de ciclo de vida do R2 faz apos 365 dias

    expect(await ler()).toMatchObject({ media: { status: "expired" } });
    expect((await fetchMedia(cookie, id)).status).toBe(410);
  });
});

describe("midia recebida: tipos", () => {
  it.each([
    ["video", "video", "video/mp4"],
    ["audio", "audio", "audio/mpeg"],
    ["ptt", "voice", "audio/ogg; codecs=opus"],
    ["document", "document", "application/pdf"],
    ["sticker", "sticker", "image/webp"],
  ] as const)("%s chega como %s com midia pendente", async (kind, type, mimetype) => {
    const { ler } = await receberMidia({ kind, mimetype, fileName: kind === "document" ? "contrato.pdf" : undefined });
    expect(await ler()).toMatchObject({ type, media: { status: "pending", mime: mimetype, name: kind === "document" ? "contrato.pdf" : null } });
  });

  it("localizacao chega com coordenadas, sem midia para baixar", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(locationMessageEvent({ lat: -23.55, lng: -46.63, name: "Escritorio", address: "Av. Paulista, 1000" }));
    const [conversa] = await inbox(cookie);
    expect((await history(cookie, conversa!.id)).messages[0]).toMatchObject({
      type: "location",
      media: null,
      location: { lat: -23.55, lng: -46.63, name: "Escritorio", address: "Av. Paulista, 1000" },
    });
  });

  it("contato compartilhado chega com nome e telefone do vCard", async () => {
    const cookie = await loginAsAtendente();
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Joao Silva\nTEL;type=CELL;waid=5511977776666:+55 11 97777-6666\nEND:VCARD";
    await postWebhook(contactMessageEvent({ displayName: "Joao Silva", vcard }));
    const [conversa] = await inbox(cookie);
    expect((await history(cookie, conversa!.id)).messages[0]).toMatchObject({
      type: "contact",
      contact: { name: "Joao Silva", phone: "+55 11 97777-6666" },
    });
  });
});
