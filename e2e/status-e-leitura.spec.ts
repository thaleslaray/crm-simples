import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function webhook(request: APIRequestContext, body: object) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, { data: { token: E2E_WEBHOOK.instanceToken, ...body } });
  expect(res.status()).toBe(200);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("não lidas aparecem na lista e zeram ao abrir; a mensagem enviada mostra entregue e lida", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  for (const n of [1, 2]) {
    await webhook(request, {
      EventType: "messages",
      message: {
        id: `st-${run}-${n}`,
        messageid: `WAST${run}${n}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: `Pergunta ${n}`,
        messageTimestamp: Date.now(),
      },
    });
  }
  await request.post(`${FAKE}/reset`);
  await request.post(`${FAKE}/program`, {
    data: { method: "POST", path: "/send/text", responses: [{ body: { id: `owner:st-out-${run}`, messageid: `st-out-${run}` } }] },
  });
  await request.post(`${FAKE}/program`, { data: { method: "POST", path: "/message/markread", responses: [{ body: { ok: true } }] } });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  const item = page.getByRole("link", { name: new RegExp(`Cliente ${run}`) });
  await expect(item.getByLabel("2 não lidas")).toBeVisible();
  await noHorizontalOverflow(page);

  await item.click();
  const conversation = page.getByRole("article", { name: `Conversa com Cliente ${run}` });
  await expect(conversation.getByText("Pergunta 2", { exact: true })).toBeVisible();
  // Abrir zera o contador e a Uazapi recebe o pedido de marcar como lida
  if (info.project.name === "mobile") await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
  await expect(item.getByLabel(/não lidas?/)).toHaveCount(0);
  await expect
    .poll(async () => {
      const calls = (await (await request.get(`${FAKE}/calls`)).json()) as { path: string; body: { id: string[] } }[];
      return calls.find((c) => c.path === "/message/markread")?.body.id.sort();
    })
    .toEqual([`st-${run}-1`, `st-${run}-2`]);
  if (info.project.name === "mobile") await item.click();

  // Envia e acompanha enviada -> entregue -> lida
  await conversation.getByLabel("Mensagem").fill(`Resposta ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect(conversation.getByRole("img", { name: "Enviada" })).toBeVisible();

  const update = (state: string) =>
    webhook(request, { EventType: "messages_update", state, event: { MessageIDs: [`st-out-${run}`], Timestamp: Math.floor(Date.now() / 1000) } });
  await update("Delivered");
  await expect(conversation.getByRole("img", { name: "Entregue" })).toBeVisible();
  await update("Read");
  await expect(conversation.getByRole("img", { name: "Lida" })).toBeVisible();
  await update("Delivered"); // não regride
  await expect(conversation.getByRole("img", { name: "Lida" })).toBeVisible();
  await noHorizontalOverflow(page);
});
