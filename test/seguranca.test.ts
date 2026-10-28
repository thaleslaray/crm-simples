import { describe, expect, it } from "vitest";
import { api, postJson } from "./helpers/api";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { deliverMediaJob, fetchMedia, programDownload } from "./helpers/media";
import { loginAsAtendente } from "./helpers/session";
import { createUser } from "./helpers/users";
import { history, inbox } from "./helpers/conversations";
import { mediaMessageEvent, postWebhook } from "./helpers/webhook";

const uazapi = fakeUazapi();
const SENHA = "senha-segura-123";

/** Login pela borda como se viesse do IP dado (a Cloudflare manda o IP real em `cf-connecting-ip`). */
const loginDoIp = (ip: string, email: string, senha: string) =>
  postJson("/api/auth/sign-in/email", { email, password: senha }, { headers: { "cf-connecting-ip": ip } });

describe("limite de tentativas no login", () => {
  it("a sexta tentativa errada seguida do mesmo IP recebe 429", async () => {
    await createUser({ email: "ana@exemplo.com", password: SENHA });
    for (let i = 0; i < 5; i++) {
      expect((await loginDoIp("203.0.113.10", "ana@exemplo.com", "senha-errada-999")).status).toBe(401);
    }
    expect((await loginDoIp("203.0.113.10", "ana@exemplo.com", "senha-errada-999")).status).toBe(429);
    // Bloqueado e bloqueado: nem a senha certa passa enquanto a janela nao vence.
    expect((await loginDoIp("203.0.113.10", "ana@exemplo.com", SENHA)).status).toBe(429);
  });

  it("outro IP nao e afetado pelo bloqueio", async () => {
    await createUser({ email: "ana@exemplo.com", password: SENHA });
    for (let i = 0; i < 6; i++) await loginDoIp("203.0.113.20", "ana@exemplo.com", "senha-errada-999");
    expect((await loginDoIp("203.0.113.21", "ana@exemplo.com", SENHA)).status).toBe(200);
  });

  it("login certo dentro do limite continua funcionando", async () => {
    await createUser({ email: "bia@exemplo.com", password: SENHA });
    for (let i = 0; i < 4; i++) await loginDoIp("203.0.113.30", "bia@exemplo.com", "senha-errada-999");
    expect((await loginDoIp("203.0.113.30", "bia@exemplo.com", SENHA)).status).toBe(200);
  });
});

describe("senha minima de 12 caracteres", () => {
  it("convite recusa senha de 11 caracteres e aceita 12", async () => {
    const { createInvite, acceptInvite } = await import("./helpers/team");
    const admin = await (await import("./helpers/session")).loginAsAdmin();
    const { token } = await createInvite(admin);
    const curta = await acceptInvite(token, { name: "Eu", email: "eu@exemplo.com", password: "onze-chars-" });
    expect(curta.status).toBe(400);
    const ok = await acceptInvite(token, { name: "Eu", email: "eu@exemplo.com", password: "doze-chars-1" });
    expect(ok.status).toBe(200);
  });
});

describe("WebSocket confere a origem", () => {
  it("upgrade com Origin de outro site e recusado com 403", async () => {
    const cookie = await loginAsAtendente();
    const res = await api("/api/realtime", { cookie, headers: { Upgrade: "websocket", Origin: "https://site-malicioso.example" } });
    expect(res.status).toBe(403);
  });

  it("upgrade com a mesma origem passa", async () => {
    const cookie = await loginAsAtendente();
    const res = await api("/api/realtime", { cookie, headers: { Upgrade: "websocket", Origin: "http://crm.test" } });
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close(1000, "fim do teste");
  });
});

describe("nome de arquivo da midia", () => {
  it("nome com emoji nao derruba a resposta e vai em filename* UTF-8", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(mediaMessageEvent({ kind: "document", mimetype: "application/pdf", fileName: "contrato 🎉.pdf" }));
    const [conversa] = await inbox(cookie);
    const id = (await history(cookie, conversa!.id)).messages[0]!.id;
    await programDownload(uazapi, { name: "c.pdf", body: "pdf", mime: "application/pdf" });
    await deliverMediaJob(id);

    const res = await fetchMedia(cookie, id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `inline; filename="contrato __.pdf"; filename*=UTF-8''${encodeURIComponent("contrato 🎉.pdf")}`,
    );
    await res.body?.cancel();
  });
});

describe("cabecalhos de seguranca", () => {
  it("respostas da API trazem os cinco cabecalhos", async () => {
    const res = await api("/api/health");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });

  it("a midia mantem a CSP propria e ganha os demais", async () => {
    const cookie = await loginAsAtendente();
    await postWebhook(mediaMessageEvent({ kind: "image" }));
    const [conversa] = await inbox(cookie);
    const id = (await history(cookie, conversa!.id)).messages[0]!.id;
    await programDownload(uazapi, { name: "a.jpg", body: "x", mime: "image/jpeg" });
    await deliverMediaJob(id);

    const res = await fetchMedia(cookie, id);
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000");
    await res.body?.cancel();
  });
});
