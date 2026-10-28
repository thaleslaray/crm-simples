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
        id: `rs-${run}`,
        messageid: `WARS${run}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Preciso de ajuda",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function program(request: APIRequestContext, status: number, body: unknown) {
  await request.post(`${FAKE}/program`, {
    data: { method: "POST", path: "/send/text", responses: [{ status, body }] },
  });
}

async function sentTexts(request: APIRequestContext): Promise<string[]> {
  const calls = (await (await request.get(`${FAKE}/calls`)).json()) as { path: string; body: { text: string } }[];
  return calls.filter((c) => c.path === "/send/text").map((c) => c.body.text);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("atendente responde com assinatura, reenvia o que falhou, preserva o rascunho e desliga a assinatura no perfil", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const other = `55118${String(Date.now()).slice(-8)}`;
  await receive(request, run, phone);
  await receive(request, `${run}b`, other);
  await request.post(`${FAKE}/reset`);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // O D1 é compartilhado: garante a assinatura ligada antes de começar
  await openUserMenu(page);
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  const signature = page.getByLabel("Assinar minhas mensagens com meu nome");
  await expect(signature).toBeEnabled();
  await signature.check();
  await page.getByRole("link", { name: "Voltar" }).click();

  const item = page.getByRole("link", { name: new RegExp(`Cliente ${run}$|Cliente ${run} `) }).first();
  await item.click();
  const conversation = page.getByRole("article", { name: `Conversa com Cliente ${run}` });
  const field = conversation.getByLabel("Mensagem");

  // Rascunho some da tela ao trocar de conversa e volta ao reabrir
  await field.fill("rascunho que não pode se perder");
  if (info.project.name === "mobile") await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
  await page.getByRole("link", { name: new RegExp(`Cliente ${run}b`) }).click();
  await expect(page.getByRole("article", { name: `Conversa com Cliente ${run}b` }).getByLabel("Mensagem")).toHaveValue("");
  if (info.project.name === "mobile") await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
  await item.click();
  await expect(field).toHaveValue("rascunho que não pode se perder");

  // Envio com assinatura: o cliente recebe `*Admin E2E:*` + quebra de linha
  await field.fill(`Olá ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect(conversation.getByText(`Olá ${run}`, { exact: true })).toBeVisible();
  await expect(field).toHaveValue("");
  await expect.poll(() => sentTexts(request)).toEqual([`*${E2E_ADMIN.name}:*\nOlá ${run}`]);

  // Recusa: aparece "Falhou"; depois reenvia manualmente
  await program(request, 400, { error: "recusado" });
  await field.fill(`Recusada ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect(conversation.getByText("Falhou")).toBeVisible();
  await program(request, 200, { id: "owner:e2e-retry" });
  await conversation.getByRole("button", { name: "Reenviar" }).click();
  await expect(conversation.getByText("Falhou")).toHaveCount(0);
  await expect.poll(() => sentTexts(request)).toHaveLength(3);
  await noHorizontalOverflow(page);

  // Desliga a assinatura no perfil: a próxima mensagem sai sem o nome
  await page.goto("/perfil");
  await expect(signature).toBeEnabled();
  await signature.uncheck();
  await expect(signature).not.toBeChecked();
  await page.reload();
  await expect(signature).not.toBeChecked();
  await noHorizontalOverflow(page);
  await page.getByRole("link", { name: "Voltar" }).click();
  await item.click();
  await field.fill(`Sem nome ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect.poll(() => sentTexts(request)).toHaveLength(4);
  expect((await sentTexts(request)).at(-1)).toBe(`Sem nome ${run}`);

  // Deixa a preferência como estava
  await page.goto("/perfil");
  await signature.check();
  await expect(signature).toBeChecked();
  await page.reload();
  await expect(signature).toBeChecked();
});
