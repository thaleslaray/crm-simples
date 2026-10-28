import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function clientWrites(request: APIRequestContext, id: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `fn-${id}`,
        messageid: `WAFN${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Quero um orcamento",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("atendente escreve nota interna, ve a ficha, edita o contato e nada disso vai ao cliente", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await clientWrites(request, run, phone);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first().click();
  const conversation = page.getByRole("article", { name: `Conversa com Cliente ${run}` });

  // Nota interna: aparece com visual proprio, autor e horario
  await conversation.getByRole("button", { name: "Nota interna" }).click();
  await conversation.getByLabel("Nota interna", { exact: true }).fill("Cliente pediu desconto de 10%");
  await conversation.getByRole("button", { name: "Salvar nota" }).click();
  const note = conversation.getByTestId("internal-note");
  await expect(note).toContainText("Cliente pediu desconto de 10%");
  await expect(note).toContainText("o cliente não vê");
  await expect(note).toContainText(E2E_ADMIN.name);
  await noHorizontalOverflow(page);

  // Ficha: abre (no celular e uma aba), mostra foto, telefone somente leitura e a nota
  const toggle = conversation.getByRole("button", { name: "Ficha do contato" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await expect(ficha.getByRole("img", { name: `Foto de Cliente ${run}` })).toBeVisible();
  await expect(ficha.getByLabel("Telefone")).toHaveAttribute("readonly", "");
  await expect(ficha.getByTestId("ficha-note")).toContainText("Cliente pediu desconto de 10%");
  await expect(ficha.getByRole("region", { name: "Histórico de conversas" })).toContainText("Aberta");

  // Edicao persiste
  await ficha.getByLabel("Empresa").fill("Loja do E2E");
  await ficha.getByLabel("E-mail").fill("cliente@loja.com");
  await ficha.getByLabel("Observação").fill("Prefere WhatsApp");
  await ficha.getByRole("button", { name: "Salvar" }).click();
  await expect(ficha.getByText("Salvo.")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.reload();
  const toggleAgain = page.getByRole("article", { name: `Conversa com Cliente ${run}` }).getByRole("button", { name: "Ficha do contato" });
  if ((await toggleAgain.getAttribute("aria-expanded")) !== "true") await toggleAgain.click();
  const again = page.getByRole("complementary", { name: "Ficha do contato" });
  await expect(again.getByLabel("Empresa")).toHaveValue("Loja do E2E");
  await expect(again.getByLabel("E-mail")).toHaveValue("cliente@loja.com");

  // Nada foi enviado ao cliente por esta tela
  const calls = (await (await request.get(`${FAKE}/calls`)).json()) as { path: string; body: { number?: string } }[];
  expect(calls.filter((c) => c.path.startsWith("/send/") && c.body?.number === phone)).toEqual([]);
});
