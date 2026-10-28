import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function receive(request: APIRequestContext, run: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `qr-${run}`,
        messageid: `WAQR${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Maria ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Oi, preciso de ajuda",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("admin cadastra resposta rápida; atendente digita / e usa com {nome} editável", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const shortcut = `ola${run}`.toLowerCase();
  await receive(request, run, `55119${String(Date.now()).slice(-8)}`);
  await request.post(`${FAKE}/reset`);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Cadastro (admin)
  await page.getByRole("link", { name: "Respostas rápidas" }).click();
  await page.getByLabel("Atalho (sem espaços)").fill(shortcut);
  await page.getByLabel("Texto", { exact: true }).fill("Olá {nome}, tudo bem?");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const list = page.getByRole("list", { name: "Respostas cadastradas" });
  await expect(list.getByText(`/${shortcut}`)).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("link", { name: "Voltar" }).click();

  // Uso na conversa
  await page.getByRole("link", { name: new RegExp(`Maria ${run}`) }).first().click();
  const conversation = page.getByRole("article", { name: `Conversa com Maria ${run}` });
  const field = conversation.getByLabel("Mensagem");
  await field.fill(`/${shortcut.slice(0, 5)}`);
  const menu = conversation.getByRole("listbox", { name: "Respostas rápidas" });
  await expect(menu.getByRole("option", { name: new RegExp(`/${shortcut}`) })).toBeVisible();
  await noHorizontalOverflow(page);
  await menu.getByRole("option", { name: new RegExp(`/${shortcut}`) }).click();
  await expect(field).toHaveValue(`Olá Maria ${run}, tudo bem?`);
  await expect(menu).toHaveCount(0);

  // Editável antes de enviar
  await field.fill(`Olá Maria ${run}, tudo bem? Editado`);
  await expect(field).toHaveValue(`Olá Maria ${run}, tudo bem? Editado`);

  // Limpa o cadastro para não poluir o D1 compartilhado
  await page.goto("/respostas-rapidas");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Apagar /${shortcut}` }).click();
  await expect(page.getByText(`/${shortcut}`)).toHaveCount(0);
});
