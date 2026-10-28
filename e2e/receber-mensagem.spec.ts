import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_WEBHOOK } from "./e2e-env";

// O D1 do E2E é compartilhado entre desktop e celular: ids e telefone únicos por execução.
function webhookMessage(
  run: string,
  n: number,
  phone: string,
  timestamp: number,
) {
  return {
    EventType: "messages",
    token: E2E_WEBHOOK.instanceToken,
    message: {
      id: `e2e-${run}-${n}`,
      messageid: `WA${run}${n}`,
      chatid: `${phone}@s.whatsapp.net`,
      sender: `${phone}@s.whatsapp.net`,
      senderName: `Cliente ${run}`,
      fromMe: false,
      isGroup: false,
      messageType: "conversation",
      text: `Mensagem ${n}`,
      messageTimestamp: timestamp,
    },
  };
}

async function receive(request: APIRequestContext, body: unknown) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: body,
  });
  expect(res.status()).toBe(200);
}

test("mensagem recebida aparece na caixa de entrada e o histórico carrega as antigas ao rolar", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55119${String(Date.now()).slice(-8)}`;
  const base = Date.now() - 80 * 60_000;
  // 80 mensagens: mais que uma página do histórico.
  for (let n = 1; n <= 80; n++)
    await receive(request, webhookMessage(run, n, phone, base + n * 60_000));

  await signInAsAdmin(page);
  // Na caixa: nome do WhatsApp e prévia da última mensagem, no topo da lista
  const item = page.getByRole("link", { name: new RegExp(`Cliente ${run}`) });
  await expect(item).toContainText("Mensagem 80");
  await expect(
    page
      .getByRole("navigation", { name: "Conversas" })
      .getByRole("link")
      .first(),
  ).toContainText(`Cliente ${run}`);

  await item.click();
  const conversation = page.getByRole("article", {
    name: `Conversa com Cliente ${run}`,
  });
  await expect(
    conversation.getByText("Mensagem 80", { exact: true }),
  ).toBeVisible();
  await expect(
    conversation.getByText("Mensagem 1", { exact: true }),
  ).toHaveCount(0);

  // Rolar para cima carrega as mais antigas, até o início
  const scroller = conversation.locator(".messages");
  await expect(async () => {
    await scroller.evaluate((el) => el.scrollTo(0, 0));
    await expect(conversation.getByText("Início da conversa")).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  await expect(
    conversation.getByText("Mensagem 1", { exact: true }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  // Celular: voltar leva à lista; desktop: a lista continua visível ao lado
  if (info.project.name === "mobile") {
    await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
    await expect(item).toBeVisible();
    // Reabre a conversa: o print opcional (E2E_PRINTS) é tirado ao fim do teste e deve mostrá-la
    await item.click();
    await expect(conversation).toBeVisible();
  } else {
    await expect(item).toBeVisible();
  }
});
