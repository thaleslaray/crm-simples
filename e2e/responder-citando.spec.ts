import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function receive(request: APIRequestContext, run: string, phone: string, n: number, text: string, extra: Record<string, unknown> = {}) {
  const jid = `${phone}@s.whatsapp.net`;
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `cit-${run}-${n}`, messageid: `WAC${run}${n}`, chatid: jid, sender: jid, senderName: `Citacao ${run}`,
        fromMe: false, isGroup: false, messageType: "conversation", text, messageTimestamp: Date.now() - 60_000 + n * 1000, ...extra,
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("atendente responde citando uma mensagem e vê a citação do cliente", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55117${String(Date.now()).slice(-8)}`;
  await receive(request, run, phone, 1, `Qual o prazo ${run}?`);
  await request.post(`${FAKE}/reset`);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("link", { name: new RegExp(`Citacao ${run}`) }).click();
  const conversation = page.getByRole("article", { name: `Conversa com Citacao ${run}` });
  await expect(conversation.getByText(`Qual o prazo ${run}?`, { exact: true })).toBeVisible();

  // Responder: aparece a barra com o trecho; cancelar a esconde
  await conversation.getByRole("button", { name: "Responder" }).click();
  await expect(conversation.getByText(`Respondendo a Citacao ${run}`)).toBeVisible();
  await conversation.getByRole("button", { name: "Cancelar resposta" }).click();
  await expect(conversation.getByText(`Respondendo a Citacao ${run}`)).toHaveCount(0);

  await conversation.getByRole("button", { name: "Responder" }).click();
  await conversation.getByLabel("Mensagem").fill(`Cinco dias ${run}`);
  await noHorizontalOverflow(page);
  await conversation.getByRole("button", { name: "Enviar" }).click();

  // A bolha enviada mostra a citação e a Uazapi recebeu o replyid
  const sent = conversation.getByRole("listitem").filter({ hasText: `Cinco dias ${run}` });
  await expect(sent.getByRole("button", { name: "Ver mensagem citada" })).toContainText(`Qual o prazo ${run}?`);
  await expect(conversation.getByText("Respondendo a")).toHaveCount(0);
  await expect
    .poll(async () => {
      const calls = (await (await request.get(`${FAKE}/calls`)).json()) as { path: string; body: { replyid?: string } }[];
      return calls.filter((c) => c.path === "/send/text").map((c) => c.body.replyid);
    })
    .toEqual([`WAC${run}1`]);

  // O cliente responde citando a mensagem do CRM: o CRM mostra o trecho citado
  await receive(request, run, phone, 2, `Obrigado ${run}`, { quoted: `WAC${run}1` });
  const reply = conversation.getByRole("listitem").filter({ hasText: `Obrigado ${run}` });
  await expect(reply.getByRole("button", { name: "Ver mensagem citada" })).toContainText(`Qual o prazo ${run}?`, { timeout: 15_000 });

  // Clicar na citação leva até a mensagem original, destacada
  await reply.getByRole("button", { name: "Ver mensagem citada" }).click();
  await expect(conversation.locator(".bubble.is-found")).toContainText(`Qual o prazo ${run}?`);
  await noHorizontalOverflow(page);
});
