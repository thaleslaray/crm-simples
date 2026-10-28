import { describe, expect, it } from "vitest";
import { api, signIn } from "./helpers/api";
import { conversationWithClient, history, resend, sendMedia, setSignature, type HistoryMessage } from "./helpers/conversations";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { loginAsAtendente } from "./helpers/session";
import { createUser } from "./helpers/users";

const SEND = "/send/media";

async function loginAsAna() {
  await createUser({ email: "ana@exemplo.com", password: "senha-segura-123", name: "Ana", role: "atendente" });
  return (await signIn("ana@exemplo.com", "senha-segura-123")).cookie;
}

const messageOf = async (res: Response) => ((await res.json()) as { message: HistoryMessage }).message;

/** Caminho + query do link que a Uazapi recebeu, para o teste buscar o arquivo como a Uazapi faria (sem sessão). */
const localPath = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

const linkOf = (call: { body: unknown }) => (call.body as { file: string }).file;

describe("Enviar mídia e nota de voz", () => {
  const uazapi = fakeUazapi();

  it("imagem com legenda sai com o nome do atendente e a Uazapi busca o arquivo por link assinado, sem sessão", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:M1", messageid: "M1" } }]);

    const res = await sendMedia(cookie, conversa, { name: "foto.png", mime: "image/png", content: "bytes-da-imagem", caption: "Segue a foto" });

    expect(res.status).toBe(201);
    expect(await messageOf(res)).toMatchObject({
      direction: "out",
      type: "image",
      text: "Segue a foto",
      status: "sent",
      authorName: "Ana",
      media: { status: "available", mime: "image/png", name: "foto.png", size: "bytes-da-imagem".length },
    });
    const [call] = await uazapi.calls();
    expect(call).toMatchObject({
      method: "POST",
      path: SEND,
      body: { number: "5511900000010", type: "image", text: "*Ana:*\nSegue a foto" },
    });
    const file = await api(localPath(linkOf(call!)));
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(await file.text()).toBe("bytes-da-imagem");
  });

  it("o link assinado recusa assinatura adulterada, outro arquivo e link vencido", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:M2" } }]);
    await sendMedia(cookie, conversa, { name: "a.png", mime: "image/png", content: "x" });
    const path = localPath(linkOf((await uazapi.calls())[0]!));
    const url = new URL(path, "http://crm.test");

    const bad = new URL(url);
    bad.searchParams.set("sig", `${url.searchParams.get("sig")!.slice(0, -2)}aa`);
    expect((await api(bad.pathname + bad.search)).status).toBe(403);

    const expired = new URL(url);
    expired.searchParams.set("exp", String(Date.now() - 1000));
    expect((await api(expired.pathname + expired.search)).status).toBe(403);

    expect((await api(path.replace(/files\/[^?]+/, "files/outra-mensagem"))).status).toBe(403);
    expect((await api(url.pathname)).status).toBe(403);
  });

  it("documento vai como document com o nome do arquivo", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:M3" } }]);

    const msg = await messageOf(await sendMedia(cookie, conversa, { name: "contrato.pdf", mime: "application/pdf", content: "%PDF" }));

    expect(msg).toMatchObject({ type: "document", text: null, media: { name: "contrato.pdf" } });
    const [call] = await uazapi.calls();
    expect(call!.body).toMatchObject({ type: "document", docName: "contrato.pdf" });
    expect(call!.body).not.toHaveProperty("text");
  });

  it("legenda sem assinatura quando o atendente a desligou", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:M4" } }]);
    await setSignature(cookie, false);

    await sendMedia(cookie, conversa, { name: "v.mp4", mime: "video/mp4", content: "v", caption: "Veja" });

    expect(await uazapi.calls()).toMatchObject([{ body: { type: "video", text: "Veja" } }]);
  });

  it("nota de voz vai como ptt, sem legenda nem assinatura, e aparece como voz no histórico", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ body: { id: "owner:V1" } }]);

    const msg = await messageOf(
      await sendMedia(cookie, conversa, { name: "voz.webm", mime: "audio/webm;codecs=opus", content: "audio", caption: "ignorada", voice: true }),
    );

    expect(msg).toMatchObject({ type: "voice", text: null, status: "sent", media: { status: "available" } });
    const [call] = await uazapi.calls();
    expect(call!.body).toMatchObject({ type: "ptt" });
    expect(call!.body).not.toHaveProperty("text");
    expect((await history(cookie, conversa)).messages.at(-1)).toMatchObject({ type: "voice", status: "sent" });
  });

  it("recusa da Uazapi vira falhou e o reenvio manual entrega o mesmo arquivo", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ status: 400, body: { error: "x" } }]);

    const failed = await messageOf(await sendMedia(cookie, conversa, { name: "a.png", mime: "image/png", content: "abc", caption: "Oi" }));
    expect(failed.status).toBe("failed");

    await uazapi.program("POST", SEND, [{ body: { id: "owner:M5" } }]);
    const again = await messageOf(await resend(cookie, conversa, failed.id));

    expect(again).toMatchObject({ id: failed.id, status: "sent" });
    const calls = await uazapi.calls();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({ type: "image", text: "*Ana:*\nOi" });
    expect((await api(localPath(linkOf(calls[1]!)))).status).toBe(200);
  });

  it("timeout vira incerto e não é reenviado", async () => {
    const cookie = await loginAsAna();
    const conversa = await conversationWithClient(cookie);
    await uazapi.program("POST", SEND, [{ delayMs: 1500, body: { id: "owner:LATE" } }]);

    const msg = await messageOf(await sendMedia(cookie, conversa, { name: "a.png", mime: "image/png", content: "a" }));

    expect(msg.status).toBe("uncertain");
    await new Promise((r) => setTimeout(r, 2000));
    expect(await uazapi.calls()).toHaveLength(1);
    expect((await resend(cookie, conversa, msg.id)).status).toBe(409);
  });

  it("recusa arquivo vazio, nota de voz que não é áudio, conversa inexistente e quem não tem sessão", async () => {
    const cookie = await loginAsAtendente();
    const conversa = await conversationWithClient(cookie);

    expect((await sendMedia(cookie, conversa, { name: "a.png", mime: "image/png", content: "" })).status).toBe(400);
    expect((await sendMedia(cookie, conversa, { name: "a.png", mime: "image/png", content: "x", voice: true })).status).toBe(400);
    expect((await sendMedia(cookie, "nao-existe", { name: "a.png", mime: "image/png", content: "x" })).status).toBe(404);
    expect((await sendMedia("", conversa, { name: "a.png", mime: "image/png", content: "x" })).status).toBe(401);
    expect(await uazapi.calls()).toHaveLength(0);
  });
});
