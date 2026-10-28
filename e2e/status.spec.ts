import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function clientWrites(
  request: APIRequestContext,
  id: string,
  phone: string,
  text: string,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `st-${id}`,
        messageid: `WAST${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text,
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("atendente assume, responde, o cliente volta, resolve e filtra a caixa", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55117${String(Date.now()).slice(-8)}`;
  await clientWrites(request, run, phone, "Preciso de ajuda");
  await request.post(`${FAKE}/program`, {
    data: {
      method: "POST",
      path: "/send/text",
      responses: [{ status: 200, body: { id: `owner:st-out-${run}` } }],
    },
  });

  await signInAsAdmin(page);const item = page
    .getByRole("link", { name: new RegExp(`Cliente ${run}`) })
    .first();
  await expect(item).toContainText("Aberta");
  await expect(item).toContainText("sem dono");
  await item.click();
  const conversation = page.getByRole("article", {
    name: `Conversa com Cliente ${run}`,
  });
  const status = conversation.getByTestId("conversation-status");
  await expect(status).toHaveText("Aberta");

  // Assumir: em andamento, com o evento na linha do tempo
  await conversation.getByRole("button", { name: "Assumir" }).click();
  await expect(status).toHaveText("Em andamento");
  await expect(conversation.getByTestId("conversation-assignee")).toContainText(
    E2E_ADMIN.name,
  );
  await expect(conversation.getByTestId("system-event")).toContainText(
    `${E2E_ADMIN.name} assumiu a conversa`,
  );
  await noHorizontalOverflow(page);

  // Responder: passa sozinha a aguardando cliente, sem evento novo
  await conversation.getByLabel("Mensagem").fill(`Olá ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect(status).toHaveText("Aguardando cliente");
  await expect(conversation.getByTestId("system-event")).toHaveCount(1);

  // Cliente escreve de novo: volta a em andamento em tempo real, na tela aberta
  await clientWrites(request, `${run}b`, phone, "Voltei");
  await expect(status).toHaveText("Em andamento");

  // Resolver
  await conversation.getByRole("button", { name: "Resolver" }).click();
  await expect(status).toHaveText("Resolvida");
  await expect(conversation.getByTestId("system-event").last()).toContainText(
    "resolveu a conversa",
  );
  await expect(
    conversation.getByRole("button", { name: "Resolver" }),
  ).toHaveCount(0);

  // Filtros da caixa (no celular a lista fica atrás da conversa)
  if (info.project.name === "mobile")
    await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
  const more = page.getByRole("button", { name: /^Mais filtros/ });
  await more.click();
  await page.getByRole("button", { name: "Resolvidas", exact: true }).click();
  await expect(item).toBeVisible();
  await more.click();
  await page
    .getByRole("button", { name: "Aguardando cliente", exact: true })
    .click();
  await expect(item).toHaveCount(0);
  await more.click();
  await page
    .getByRole("button", { name: "Aguardando cliente", exact: true })
    .click(); // de novo: desliga
  await page.getByRole("button", { name: "Minhas" }).click();
  await expect(item).toBeVisible();
  await page.getByRole("button", { name: /^Sem dono/ }).click();
  await expect(item).toHaveCount(0);
  await noHorizontalOverflow(page);
});
