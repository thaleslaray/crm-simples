import type { Browser, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

// O D1 do E2E é compartilhado entre desktop e celular: ids e telefone únicos por execução.
function webhookMessage(run: string, n: number, phone: string) {
  return {
    EventType: "messages",
    token: E2E_WEBHOOK.instanceToken,
    message: {
      id: `rt-${run}-${n}`,
      messageid: `WART${run}${n}`,
      chatid: `${phone}@s.whatsapp.net`,
      sender: `${phone}@s.whatsapp.net`,
      senderName: `Cliente ${run}`,
      fromMe: false,
      isGroup: false,
      messageType: "conversation",
      text: `Mensagem ao vivo ${n}`,
      messageTimestamp: Date.now() + n,
    },
  };
}

/** Uma sessão logada num contexto próprio (cookies separados), como uma segunda pessoa. */
async function loggedInPage(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(info.project.use);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("navigation", { name: "Conversas" }),
  ).toBeVisible();
  return { context, page };
}

test("mensagem recebida aparece para duas sessões, na lista e na conversa aberta, sem recarregar", async ({
  browser,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const send = async (n: number) => {
    const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
      data: webhookMessage(run, n, phone),
    });
    expect(res.status()).toBe(200);
  };

  // A primeira mensagem cria a conversa; as duas sessões já a veem
  await send(1);
  const a = await loggedInPage(browser, info);
  const b = await loggedInPage(browser, info);
  const item = (p: typeof a.page) =>
    p.getByRole("link", { name: new RegExp(`Cliente ${run}`) });
  await expect(item(a.page)).toContainText("Mensagem ao vivo 1");
  await expect(item(b.page)).toContainText("Mensagem ao vivo 1");

  // Sessão A abre a conversa; a B fica só na lista
  await item(a.page).click();
  const conversationA = a.page.getByRole("article", {
    name: `Conversa com Cliente ${run}`,
  });
  await expect(
    conversationA.getByText("Mensagem ao vivo 1", { exact: true }),
  ).toBeVisible();

  // Chega outra mensagem: nenhuma das duas recarrega
  await send(2);
  await expect(
    conversationA.getByText("Mensagem ao vivo 2", { exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await expect(item(b.page)).toContainText("Mensagem ao vivo 2");
  } else {
    await expect(item(a.page)).toContainText("Mensagem ao vivo 2");
    await expect(item(b.page)).toContainText("Mensagem ao vivo 2");
  }
  // A conversa vai para o topo da lista de B
  await expect(
    b.page
      .getByRole("navigation", { name: "Conversas" })
      .getByRole("link")
      .first(),
  ).toContainText(`Cliente ${run}`);

  await a.context.close();
  await b.context.close();
});
