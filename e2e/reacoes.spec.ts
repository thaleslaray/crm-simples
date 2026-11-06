import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function webhook(
  request: APIRequestContext,
  message: Record<string, unknown>,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "messages", token: E2E_WEBHOOK.instanceToken, message },
  });
  expect(res.status()).toBe(200);
}

async function clientSays(
  request: APIRequestContext,
  run: string,
  phone: string,
  text: string,
) {
  const jid = `${phone}@s.whatsapp.net`;
  await webhook(request, {
    id: `rea-${run}-1`,
    messageid: `WAR${run}1`,
    chatid: jid,
    sender: jid,
    senderName: `Reacao ${run}`,
    fromMe: false,
    isGroup: false,
    messageType: "conversation",
    text,
    messageTimestamp: Date.now() - 60_000,
  });
}

async function reactCalls(request: APIRequestContext, id: string) {
  const calls = (await (await request.get(`${FAKE}/calls`)).json()) as {
    path: string;
    body: { id?: string; text?: string };
  }[];
  return calls
    .filter((c) => c.path === "/message/react" && c.body.id === id)
    .map((c) => c.body.text);
}

async function openConversation(page: Page, run: string) {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: new RegExp(`Reacao ${run}`) }).click();
  return page.getByRole("article", { name: `Conversa com Reacao ${run}` });
}

// Computador: passa o mouse e clica na carinha. Celular (sem hover): toque longo no balão abre a barra.
async function openPicker(bubble: Locator, page: Page) {
  if (page.viewportSize()!.width < 768) {
    await bubble.evaluate((el) =>
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "touch",
          bubbles: true,
        }),
      ),
    );
    await page.waitForTimeout(900);
    await bubble.evaluate((el) =>
      el.dispatchEvent(
        new PointerEvent("pointerup", { pointerType: "touch", bubbles: true }),
      ),
    );
  } else {
    await bubble.hover();
    await bubble.getByRole("button", { name: "Reagir", exact: true }).click();
  }
  await expect(page.getByRole("dialog", { name: "Reações" })).toBeVisible();
}

async function pickReaction(bubble: Locator, page: Page, name: string) {
  await openPicker(bubble, page);
  const picker = page.getByRole("dialog", { name: "Reações" });
  await picker.getByRole("button", { name }).click();
  await expect(picker).toHaveCount(0);
}

test("atendente reage, troca e tira a reação de uma mensagem do cliente", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await clientSays(request, run, phone, `Gostei da proposta ${run}`);

  const conversation = await openConversation(page, run);
  const bubble = conversation
    .locator("li.bubble--in")
    .filter({ hasText: `Gostei da proposta ${run}` });
  await expect(bubble).toBeVisible();

  // Reagir com 👍
  await pickReaction(bubble, page, "Reagir com 👍");
  const chip = (label: string) =>
    conversation.getByRole("button", { name: label, exact: true });
  await expect(chip("Reações: 👍 de Você")).toBeVisible();
  await expect.poll(() => reactCalls(request, `WAR${run}1`)).toEqual(["👍"]);

  // Recarregar mantém o selo
  await page.reload();
  await expect(chip("Reações: 👍 de Você")).toBeVisible();

  // Trocar para ❤️ substitui
  await pickReaction(bubble, page, "Reagir com ❤️");
  await expect(chip("Reações: ❤️ de Você")).toBeVisible();
  await expect(chip("Reações: 👍 de Você")).toHaveCount(0);
  await expect
    .poll(() => reactCalls(request, `WAR${run}1`))
    .toEqual(["👍", "❤️"]);

  // A reação atual aparece marcada; clicar nela remove
  await openPicker(bubble, page);
  const picker = page.getByRole("dialog", { name: "Reações" });
  await expect(
    picker.getByRole("button", { name: "Tirar reação ❤️" }),
  ).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Tirar reação ❤️" }).click();
  await expect(
    conversation.getByRole("button", { name: /^Reações:/ }),
  ).toHaveCount(0);
  await expect
    .poll(() => reactCalls(request, `WAR${run}1`))
    .toEqual(["👍", "❤️", ""]);

  // Também dá para tirar pelo selo: reage de novo e remove pelo "Quem reagiu"
  await pickReaction(bubble, page, "Reagir com 😂");
  await chip("Reações: 😂 de Você").click();
  await expect(page.getByRole("dialog", { name: "Quem reagiu" })).toBeVisible();
  await page
    .getByRole("button", { name: "Tirar a reação 😂 da equipe" })
    .click();
  await expect(
    conversation.getByRole("button", { name: /^Reações:/ }),
  ).toHaveCount(0);

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("reação do cliente chega em tempo real, sem prévia nova, e mensagem da equipe não tem Reagir", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await clientSays(request, run, phone, `Oi ${run}`);

  const conversation = await openConversation(page, run);
  // O D1 é compartilhado entre desktop e celular e a Uazapi falsa devolve sempre "e2e-out": sem um id próprio,
  // a reação cairia na mensagem enviada pelo outro projeto.
  const outId = `WAO${run}`;
  await request.post(`${FAKE}/program`, {
    data: {
      method: "POST",
      path: "/send/text",
      responses: [{ body: { id: `owner:${outId}`, messageid: outId } }],
    },
  });
  await conversation.getByLabel("Mensagem").fill(`Segue o orçamento ${run}`);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  const sent = conversation
    .locator("li.bubble--out")
    .filter({ hasText: `Segue o orçamento ${run}` });
  await expect(sent).toBeVisible();
  await expect(sent.getByRole("img", { name: "Enviada" })).toBeVisible();
  await request.post(`${FAKE}/reset`);
  const item = page.getByRole("link", { name: new RegExp(`Reacao ${run}`) });
  const mobile = page.viewportSize()!.width < 768;
  if (!mobile) await expect(item).toContainText(`Segue o orçamento ${run}`);

  // O cliente reage à mensagem enviada pelo CRM (messageid único programado acima)
  const jid = `${phone}@s.whatsapp.net`;
  await webhook(request, {
    id: `rea-${run}-2`,
    messageid: `WAR${run}2`,
    chatid: jid,
    sender: jid,
    senderName: `Reacao ${run}`,
    fromMe: false,
    isGroup: false,
    messageType: "ReactionMessage",
    text: "❤️",
    reaction: outId,
    messageTimestamp: Date.now(),
  });
  await expect(
    conversation.getByRole("button", {
      name: `Reações: ❤️ de Reacao ${run}`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });

  // Reação não vira mensagem nem muda a prévia da lista
  await expect(conversation.locator("li.bubble")).toHaveCount(2);

  // Balão da equipe não tem Reagir
  await sent.hover();
  await expect(
    sent.getByRole("button", { name: "Reagir", exact: true }),
  ).toHaveCount(0);

  // A lista de conversas não ganhou prévia nova (no celular, é preciso voltar para vê-la)
  if (mobile)
    await page.getByRole("link", { name: "Voltar à caixa de entrada" }).click();
  await expect(item).toContainText(`Segue o orçamento ${run}`);
  await expect(item).not.toContainText("❤️");
});

test("se a Uazapi falha ao reagir, o selo some e aparece o aviso", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await clientSays(request, run, phone, `Preciso de ajuda ${run}`);

  const conversation = await openConversation(page, run);
  const bubble = conversation
    .locator("li.bubble--in")
    .filter({ hasText: `Preciso de ajuda ${run}` });
  await expect(bubble).toBeVisible();

  const programmed = await request.post(`${FAKE}/program`, {
    data: {
      method: "POST",
      path: "/message/react",
      responses: [{ status: 500, body: { error: "falha" } }],
    },
  });
  expect(programmed.ok()).toBe(true);
  try {
    await pickReaction(bubble, page, "Reagir com 🙏");
    await expect(
      page.getByText("Não foi possível reagir. Tente de novo."),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      conversation.getByRole("button", { name: /^Reações:/ }),
    ).toHaveCount(0);
  } finally {
    await request.post(`${FAKE}/reset`);
  }
});
