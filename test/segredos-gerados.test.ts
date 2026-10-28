import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getAuthSecret, getWebhookSecret, resetInstanceSecretsCache } from "../src/worker/instance-secrets";
import { signedFileUrl } from "../src/worker/signed-files";
import { resolveUazapiConfig } from "../src/worker/uazapi/config";
import { api, postJson } from "./helpers/api";
import { fakeUazapi } from "./helpers/fake-uazapi";
import { seedStoredSecrets, storedSecrets, withGeneratedSecrets } from "./helpers/instance-secrets";
import { loginAsAdmin } from "./helpers/session";
import { seedLegacyInstanceToken, storedUazapiRow } from "./helpers/uazapi-config";
import { connectionEvent, postWebhook } from "./helpers/webhook";

// base64url de 32 bytes = 43 caracteres.
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

describe("segredos gerados pelo CRM: o que vale e onde fica", () => {
  it("sem os segredos no ambiente, gera, guarda no banco e devolve sempre o mesmo valor", async () => {
    await withGeneratedSecrets(async () => {
      const auth = await getAuthSecret(env);
      const webhook = await getWebhookSecret(env);

      expect(auth).toMatch(BASE64URL_32_BYTES);
      expect(webhook).toMatch(BASE64URL_32_BYTES);
      expect(auth).not.toBe(webhook);
      expect(await storedSecrets()).toEqual({ authSecret: auth, webhookSecret: webhook });
      expect(await getAuthSecret(env)).toBe(auth);
      expect(await getWebhookSecret(env)).toBe(webhook);
    });
  });

  it("depois de o cache da memoria esvaziar (outro isolate), le do banco o mesmo valor", async () => {
    await withGeneratedSecrets(async () => {
      const auth = await getAuthSecret(env);
      resetInstanceSecretsCache();

      expect(await getAuthSecret(env)).toBe(auth);
      expect((await storedSecrets())?.authSecret).toBe(auth);
    });
  });

  it("varias requisicoes simultaneas na primeira vez ficam com o mesmo valor, o que ficou gravado", async () => {
    await withGeneratedSecrets(async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, async () => [await getAuthSecret(env), await getWebhookSecret(env)] as const),
      );

      const stored = await storedSecrets();
      for (const [auth, webhook] of results) {
        expect(auth).toBe(stored?.authSecret);
        expect(webhook).toBe(stored?.webhookSecret);
      }
    });
  });

  it("segredo no ambiente vence: o banco nao e lido nem escrito", async () => {
    // Um valor diferente guardado no banco prova que ele nao foi lido; a linha intacta prova que nada foi escrito.
    await seedStoredSecrets("guardado-auth", "guardado-webhook");

    expect(await getAuthSecret(env)).toBe(env.BETTER_AUTH_SECRET);
    expect(await getWebhookSecret(env)).toBe(env.WEBHOOK_URL_SECRET);
    expect(await storedSecrets()).toEqual({ authSecret: "guardado-auth", webhookSecret: "guardado-webhook" });
  });

  it("com os dois no ambiente e o banco vazio, nada e gravado", async () => {
    await getAuthSecret(env);
    await getWebhookSecret(env);

    expect(await storedSecrets()).toBeNull();
  });

  it("so um dos segredos no ambiente: esse vale, e o outro vem do banco", async () => {
    await withGeneratedSecrets(async () => {
      env.BETTER_AUTH_SECRET = "so-este-esta-no-ambiente-com-mais-de-32-caracteres";

      expect(await getAuthSecret(env)).toBe("so-este-esta-no-ambiente-com-mais-de-32-caracteres");
      expect(await getWebhookSecret(env)).toMatch(BASE64URL_32_BYTES);
    });
  });
});

describe("segredos gerados pelo CRM: as funcoes que dependem deles", () => {
  const uazapi = fakeUazapi();

  it("login funciona e a sessao continua valendo nas requisicoes seguintes", async () => {
    await withGeneratedSecrets(async () => {
      const cookie = await loginAsAdmin();

      expect(cookie).not.toBe("");
      expect((await api("/api/connection", { cookie })).status).toBe(200);
      // Rota que muda estado reabre a sessao no banco: tambem precisa validar a assinatura do cookie.
      expect((await api("/api/auth/get-session?disableCookieCache=true", { cookie })).status).toBe(200);
    });
  });

  it("link assinado de midia: o gerado vale, adulterado nao", async () => {
    await withGeneratedSecrets(async () => {
      const link = new URL(await signedFileUrl(env, "http://crm.test", "msg-inexistente"));
      const path = link.pathname + link.search;

      // 404 = a assinatura passou e a mensagem nao existe; 403 = assinatura recusada.
      expect((await api(path)).status).toBe(404);
      expect((await api(path.replace(/sig=./, "sig=x"))).status).toBe(403);
    });
  });

  it("token da Uazapi cifrado com o segredo gerado volta inteiro e nao fica em claro no banco", async () => {
    await withGeneratedSecrets(async () => {
      await seedLegacyInstanceToken("http://127.0.0.1:1", "token-secreto-da-instancia");

      expect(await resolveUazapiConfig(env)).toMatchObject({ token: "token-secreto-da-instancia", source: "database" });
      expect(await storedUazapiRow()).not.toContain("token-secreto-da-instancia");
    });
  });

  it("webhook: o endereco com o segredo gerado e aceito, com outro segredo nao", async () => {
    await withGeneratedSecrets(async () => {
      await seedLegacyInstanceToken("http://127.0.0.1:1", "token-da-instancia");
      const secret = await getWebhookSecret(env);
      const event = connectionEvent({ status: "connected", token: "token-da-instancia" });

      expect((await postWebhook(event, secret)).status).toBe(200);
      expect((await postWebhook(event, "outro-segredo")).status).toBe(401);
    });
  });

  it("conectar cadastra na Uazapi o endereco do webhook com o segredo gerado", async () => {
    await withGeneratedSecrets(async () => {
      const cookie = await loginAsAdmin();
      await Promise.all([
        uazapi.program("POST", "/webhook", [{ body: [] }]),
        uazapi.program("POST", "/instance/connect", [{ body: { instance: { status: "connecting", qrcode: "QR" } } }]),
      ]);

      expect((await postJson("/api/connection/connect", {}, { cookie })).status).toBe(200);

      const hook = (await uazapi.calls()).find((c) => c.path === "/webhook");
      expect(hook?.body).toMatchObject({ url: `http://crm.test/api/webhook/${await getWebhookSecret(env)}` });
    });
  });
});
