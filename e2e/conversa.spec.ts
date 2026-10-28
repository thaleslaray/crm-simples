import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_ADMIN, E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function clientWrites(
  request: APIRequestContext,
  run: string,
  phone: string,
  n: number,
  text: string,
) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `cv-${run}-${n}`,
        messageid: `WACV${run}${n}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
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

/** A Uazapi falsa devolve o mesmo id em todo envio: cada resposta ganha o seu para não colidir. */
async function reply(
  request: APIRequestContext,
  page: Page,
  conversation: ReturnType<Page["getByRole"]>,
  id: string,
  text: string,
) {
  await request.post(`${FAKE}/program`, {
    data: {
      method: "POST",
      path: "/send/text",
      responses: [{ body: { id: `owner:${id}`, messageid: id } }],
    },
  });
  await conversation.getByLabel("Mensagem").fill(text);
  await conversation.getByRole("button", { name: "Enviar" }).click();
  await expect(conversation.getByText(text)).toBeVisible();
  await expect(
    conversation.getByRole("img", { name: "Enviada" }).last(),
  ).toBeVisible();
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

/** Com E2E_PRINTS, salva um print do passo (revisão visual); sem a variável não faz nada. */
async function snap(page: Page, name: string, project: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir)
    await page.screenshot({ path: `${dir}/conversa-${name}-${project}.png` });
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("crm.theme", t);
    document.documentElement.dataset.theme = t;
  }, theme);
}

test("conversa no estilo do WhatsApp: botão de ação por status, autor só no primeiro da sequência, nota distinta", async ({
  page,
  request,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 900 });
  const run = `${info.project.name}${Date.now()}`;
  const phone = `55117${String(Date.now()).slice(-8)}`;
  await clientWrites(request, run, phone, 1, "Oi, vocês entregam?");
  await clientWrites(request, run, phone, 2, "Quero saber o prazo");

  await signInAsAdmin(page);
  await page
    .getByRole("link", { name: new RegExp(`Cliente ${run}`) })
    .first()
    .click();
  const conversation = page.getByRole("article", {
    name: `Conversa com Cliente ${run}`,
  });

  // Aberta sem dono: só "Assumir"; nada de "Resolver"
  await expect(conversation.getByTestId("conversation-assignee")).toHaveText(
    "sem dono",
  );
  await expect(
    conversation.getByRole("button", { name: "Assumir" }),
  ).toBeVisible();
  await expect(
    conversation.getByRole("button", { name: "Resolver" }),
  ).toHaveCount(0);
  await snap(page, "01-aberta", info.project.name);

  // Em andamento: troca "Assumir" por "Resolver"
  await conversation.getByRole("button", { name: "Assumir" }).click();
  await expect(
    conversation.getByRole("button", { name: "Resolver" }),
  ).toBeVisible();
  await expect(
    conversation.getByRole("button", { name: "Assumir" }),
  ).toHaveCount(0);
  await expect(conversation.getByTestId("conversation-assignee")).toHaveText(
    `com ${E2E_ADMIN.name}`,
  );

  // Duas respostas seguidas: o nome do autor aparece só na primeira
  await reply(request, page, conversation, `cv-${run}-a`, "Entregamos sim");
  await reply(
    request,
    page,
    conversation,
    `cv-${run}-b`,
    "Em até 2 dias úteis",
  );
  await expect(conversation.locator(".bubble-author")).toHaveCount(1);
  await expect(conversation.locator(".bubble-author")).toHaveText(
    E2E_ADMIN.name,
  );

  // O cliente fala no meio: o autor volta a aparecer na próxima resposta
  await clientWrites(request, run, phone, 3, "Perfeito, obrigado");
  await expect(conversation.getByText("Perfeito, obrigado")).toBeVisible();
  await reply(request, page, conversation, `cv-${run}-c`, "Por nada!");
  await expect(conversation.locator(".bubble-author")).toHaveCount(2);

  // Nota interna: balão próprio, fora dos balões de mensagem
  await conversation.getByRole("button", { name: "Nota interna" }).click();
  await conversation
    .locator("form.composer textarea")
    .fill("Cliente costuma pedir desconto");
  await conversation.getByRole("button", { name: "Salvar nota" }).click();
  const note = conversation.getByTestId("internal-note");
  await expect(note).toContainText("Cliente costuma pedir desconto");
  await expect(note).toContainText("nota interna, o cliente não vê");
  await expect(note).toContainText(E2E_ADMIN.name);
  expect(await note.evaluate((el) => el.classList.contains("bubble"))).toBe(
    false,
  );

  // Menu ⋮: ver ficha e transferir (admin, conversa com dono); sem chamada nem vídeo
  await conversation.getByRole("button", { name: "Mais opções" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Ver ficha do contato" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Transferir" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Atribuir a/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /chamada|vídeo/i }),
  ).toHaveCount(0);
  await snap(page, "02-menu", info.project.name);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await noHorizontalOverflow(page);

  // Temas: claro e escuro
  await setTheme(page, "light");
  await snap(page, "03-claro", info.project.name);
  await setTheme(page, "dark");
  await snap(page, "04-escuro", info.project.name);
  await setTheme(page, "light");

  // Resolvida: nenhum botão de ação
  await conversation.getByRole("button", { name: "Resolver" }).click();
  await expect(conversation.getByTestId("conversation-status")).toHaveText(
    "Resolvida",
  );
  await expect(
    conversation.getByRole("button", { name: "Resolver" }),
  ).toHaveCount(0);
  await expect(
    conversation.getByRole("button", { name: "Assumir" }),
  ).toHaveCount(0);
  await noHorizontalOverflow(page);
});
