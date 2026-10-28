import type { APIRequestContext, Page } from "@playwright/test";
import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function receive(request: APIRequestContext, run: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `em-${run}`,
        messageid: `WAEM${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Pode me mandar?",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

type MediaCall = { path: string; body: { type: string; text?: string; file: string; docName?: string } };
async function mediaCalls(request: APIRequestContext): Promise<MediaCall["body"][]> {
  const calls = (await (await request.get(`${FAKE}/calls`)).json()) as MediaCall[];
  return calls.filter((c) => c.path === "/send/media").map((c) => c.body);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("atendente anexa uma imagem com legenda e grava uma nota de voz: ouve, descarta, grava de novo e envia", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55117${String(Date.now()).slice(-8)}`;
  await receive(request, run, phone);
  await request.post(`${FAKE}/reset`);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Assinatura ligada, para conferir o nome na legenda
  await openUserMenu(page);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  const signature = page.getByLabel("Assinar minhas mensagens com meu nome");
  await expect(signature).toBeEnabled();
  await signature.check();
  await page.getByRole("link", { name: "Voltar" }).click();

  await page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first().click();
  const conversation = page.getByRole("article", { name: `Conversa com Cliente ${run}` });

  // Imagem com legenda
  await conversation.locator("input[type=file]:not([capture])").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(conversation.getByLabel("Anexo")).toContainText("foto.png");
  await conversation.getByLabel("Mensagem").fill(`Legenda ${run}`);
  await conversation.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(conversation.locator("img.media")).toBeVisible();
  await expect(conversation.getByText(`Legenda ${run}`, { exact: true })).toBeVisible();
  await expect.poll(() => mediaCalls(request)).toMatchObject([{ type: "image", text: `*${E2E_ADMIN.name}:*\nLegenda ${run}` }]);
  await noHorizontalOverflow(page);

  // Nota de voz: grava, ouve, descarta (nada é enviado), grava de novo e envia
  await conversation.getByRole("button", { name: "Gravar nota de voz" }).click();
  await expect(conversation.getByRole("status")).toContainText("Gravando");
  await page.waitForTimeout(1500);
  await conversation.getByRole("button", { name: "Parar" }).click();
  await expect(conversation.getByLabel("Prévia da nota de voz")).toBeVisible();
  await noHorizontalOverflow(page);
  await conversation.getByRole("button", { name: "Descartar" }).click();
  await expect(conversation.getByLabel("Mensagem")).toBeVisible();
  expect(await mediaCalls(request)).toHaveLength(1);

  await conversation.getByRole("button", { name: "Gravar nota de voz" }).click();
  await expect(conversation.getByRole("status")).toContainText("Gravando");
  await page.waitForTimeout(1500);
  await conversation.getByRole("button", { name: "Parar" }).click();
  await conversation.getByRole("button", { name: "Enviar nota de voz" }).click();
  await expect(conversation.getByLabel("Nota de voz")).toBeVisible();
  await expect.poll(async () => (await mediaCalls(request)).length).toBe(2);
  const voice = (await mediaCalls(request))[1]!;
  expect(voice.type).toBe("ptt");
  expect(voice).not.toHaveProperty("text");
  await noHorizontalOverflow(page);
});
