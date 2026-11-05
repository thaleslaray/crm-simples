import { describe, expect, it } from "vitest";
import { api, postJson } from "./helpers/api";
import { conversationWithClient, history, sendMedia } from "./helpers/conversations";
import { addNote, listNotes, seedNotes } from "./helpers/ficha";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { loginAsAtendente } from "./helpers/session";

const MiB = 1024 * 1024;

describe("Limites de tamanho e de volume", () => {
  const uazapi = fakeUazapi();

  it("corpo de anexo acima do limite é recusado com 413 sem gravar nem enviar nada", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);

    const res = await sendMedia(cookie, conversa, { name: "enorme.pdf", mime: "application/pdf", content: "x".repeat(22 * MiB) });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "arquivo_grande_demais", message: "Arquivo grande demais (máximo 20 MB)." });
    expect((await history(cookie, conversa)).messages.map((m) => m.direction)).toEqual(["in"]);
    expect(await uazapi.calls()).toEqual([]);
  });

  it("formulário de anexo com campo de texto gigante e sem arquivo também é recusado com 413", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    const form = new FormData();
    form.set("text", "x".repeat(22 * MiB));

    const res = await api(`/api/conversations/${conversa}/messages`, { method: "POST", cookie, body: form });

    expect(res.status).toBe(413);
  });

  it("anexo de 20 MB continua passando", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", "/send/media", [{ body: { id: "owner:L1" } }]);

    const res = await sendMedia(cookie, conversa, { name: "grande.pdf", mime: "application/pdf", content: "x".repeat(20 * MiB) });

    expect(res.status).toBe(201);
  });

  it("corpo JSON de mensagem acima de 64 KiB é recusado com 413", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);

    const res = await postJson(`/api/conversations/${conversa}/messages`, { text: "a".repeat(70 * 1024) }, { cookie });

    expect(res.status).toBe(413);
    expect((await history(cookie, conversa)).messages).toHaveLength(1);
  });

  it("corpo JSON de nota acima de 64 KiB é recusado com 413", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);

    const res = await addNote(cookie, conversa, "a".repeat(70 * 1024));

    expect(res.status).toBe(413);
    expect(await listNotes(cookie, conversa)).toEqual([]);
  });

  it("nome de anexo muito longo é encurtado em 255 caracteres mantendo a extensão", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", "/send/media", [{ body: { id: "owner:L2" } }]);

    const res = await sendMedia(cookie, conversa, { name: `${"a".repeat(400)}.pdf`, mime: "application/pdf", content: "x" });

    const { message } = (await res.json()) as { message: { media: { name: string } } };
    expect(message.media.name).toHaveLength(255);
    expect(message.media.name.endsWith("aaa.pdf")).toBe(true);
  });

  it("tipo de anexo fora do formato tipo/subtipo vira application/octet-stream", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", "/send/media", [{ body: { id: "owner:L3" } }]);

    const res = await sendMedia(cookie, conversa, { name: "a.bin", mime: "lixo sem barra", content: "x" });

    const { message } = (await res.json()) as { message: { media: { mime: string } } };
    expect(message.media.mime).toBe("application/octet-stream");
  });

  it("a 501ª nota da conversa é recusada", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await seedNotes(conversa, 500);

    const res = await addNote(cookie, conversa, "a nota que passa do limite");

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "limite_de_notas" });
    expect(await listNotes(cookie, conversa)).toHaveLength(500);
  });

  it("a leitura de notas devolve só as 500 mais recentes, da mais antiga para a mais nova", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);
    await seedNotes(conversa, 600);

    const notas = await listNotes(cookie, conversa);

    expect(notas).toHaveLength(500);
    expect(notas[0]!.text).toBe("nota 101");
    expect(notas.at(-1)!.text).toBe("nota 600");
  });
});
