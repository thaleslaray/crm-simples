import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInAsAdmin } from "./navegacao";
import { E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";

const FAKE = `http://127.0.0.1:${E2E_UAZAPI_PORT}/__fake`;

async function webhook(request: APIRequestContext, body: object) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { token: E2E_WEBHOOK.instanceToken, ...body },
  });
  expect(res.status()).toBe(200);
}

/** O cliente `name` escreve uma vez pelo webhook; a conversa nasce aberta, sem dono e com uma não lida. */
async function clientWrites(
  request: APIRequestContext,
  run: string,
  name: string,
  phone: string,
) {
  await webhook(request, {
    EventType: "messages",
    message: {
      id: `lc-${run}-${name}`,
      messageid: `WALC${run}${name}`,
      chatid: `${phone}@s.whatsapp.net`,
      sender: `${phone}@s.whatsapp.net`,
      senderName: name,
      fromMe: false,
      isGroup: false,
      messageType: "conversation",
      text: `Oi, aqui é ${name}`,
      messageTimestamp: Date.now(),
    },
  });
}

const newPhone = (n: number) => `55119${String(Date.now()).slice(-7)}${n}`.slice(0, 13);

async function conversationIdOf(page: Page, phone: string) {
  const res = await page.request.get("/api/conversations");
  const body = (await res.json()) as {
    conversations: { id: string; contact: { id: string; phone: string } }[];
  };
  return body.conversations.find((c) => c.contact.phone === phone)!;
}

test("Sem dono desliga ao escolher Resolvidas no ▾ (a lista não fica vazia por contradição)", async ({
  page,
}) => {
  await signInAsAdmin(page);

  await page.getByRole("button", { name: /^Sem dono/ }).click();
  await page.getByRole("button", { name: "Mais filtros" }).click();
  await page.getByRole("button", { name: "Resolvidas", exact: true }).click();

  await expect(page.getByRole("button", { name: /^Sem dono/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Tudo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Mais filtros: Resolvida" }),
  ).toBeVisible();
});

test("escolher Sem dono solta o filtro Resolvidas do ▾", async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByRole("button", { name: "Mais filtros" }).click();
  await page.getByRole("button", { name: "Resolvidas", exact: true }).click();
  await page.getByRole("button", { name: /^Sem dono/ }).click();

  await expect(
    page.getByRole("button", { name: "Mais filtros", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sem dono/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

for (const width of [1280, 1440]) {
  test(`a faixa de chips cabe inteira em ${width}px, com contagens de dois dígitos`, async ({
    page,
    request,
  }, info) => {
    test.skip(info.project.name === "mobile", "largura de computador");
    await page.setViewportSize({ width, height: 800 });
    const run = `${width}${Date.now()}`;
    for (let n = 0; n < 12; n++)
      await clientWrites(request, run, `Fila${n}${run}`, newPhone(n));
    await signInAsAdmin(page);
    const chip = page.getByRole("button", { name: /^Sem dono/ });
    await expect
      .poll(async () => Number((await chip.getByTestId("chip-count").innerText()) || 0))
      .toBeGreaterThanOrEqual(10);
    await expect(
      page.getByRole("button", { name: /^Não lidas/ }).getByTestId("chip-count"),
    ).toHaveText(/^\d{2,}$/);

    const bar = page.locator(".filter-chips");
    const fits = await bar.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    const more = await page.getByRole("button", { name: "Mais filtros" }).boundingBox();
    const list = await page.getByRole("navigation", { name: "Conversas" }).boundingBox();
    expect(more!.x + more!.width).toBeLessThanOrEqual(list!.x + list!.width);
    // Print da revisão visual (só com E2E_PRINTS): a lista em 1440px, tema claro.
    const dir = process.env.E2E_PRINTS;
    if (dir && width === 1440)
      await page.screenshot({ path: `${dir}/lista-1440-claro-${info.project.name}.png` });
  });
}

test("a coluna da lista tem no mínimo 340px e cerca de 30% da tela", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "largura de computador");
  await page.setViewportSize({ width: 1440, height: 800 });
  await signInAsAdmin(page);

  const box = await page.getByRole("navigation", { name: "Conversas" }).boundingBox();

  expect(box!.width).toBeGreaterThanOrEqual(340);
  expect(Math.abs(box!.width - 1440 * 0.3)).toBeLessThanOrEqual(2);
});

test("os tiques da prévia na lista mudam quando a Uazapi avisa entregue e lida", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = newPhone(1);
  const name = `Tique ${run}`;
  await clientWrites(request, run, name, phone);
  await request.post(`${FAKE}/reset`);
  await request.post(`${FAKE}/program`, {
    data: {
      method: "POST",
      path: "/send/text",
      responses: [{ body: { id: `owner:tq-${run}`, messageid: `tq-${run}` } }],
    },
  });
  await signInAsAdmin(page);
  const row = page.getByRole("link", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  const { id } = await conversationIdOf(page, phone);
  const sent = await page.request.post(`/api/conversations/${id}/messages`, {
    data: { text: `Resposta ${run}` },
  });
  expect(sent.ok()).toBe(true);
  await expect(row).toContainText(`Resposta ${run}`);
  await expect(row.locator(".tick")).toHaveCount(1);
  await expect(row.locator(".tick--read")).toHaveCount(0);

  await webhook(request, {
    EventType: "messages_update",
    state: "Read",
    event: { MessageIDs: [`tq-${run}`], Timestamp: Math.floor(Date.now() / 1000) },
  });

  await expect(row.locator(".tick--read")).toHaveCount(1);
});

test("a foto do contato aparece na linha da lista e no cabeçalho da conversa", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = newPhone(2);
  const name = `Foto ${run}`;
  await clientWrites(request, run, name, phone);
  await signInAsAdmin(page);
  const { id, contact } = await conversationIdOf(page, phone);
  const refreshed = await page.request.post(`/api/contacts/${contact.id}/avatar/refresh`, { data: {} });
  expect(refreshed.ok()).toBe(true);
  await page.goto("/");

  const row = page.getByRole("link", { name: new RegExp(name) });
  await expect(row.locator("img")).toHaveCount(1);
  await row.click();
  await expect(page).toHaveURL(new RegExp(id));
  await expect(page.locator(".conv-who img")).toHaveCount(1);
});

test("sem foto, o cabeçalho usa iniciais com a mesma cor da linha da lista", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = newPhone(3);
  const name = `Cor ${run}`;
  await clientWrites(request, run, name, phone);
  await signInAsAdmin(page);
  const row = page.getByRole("link", { name: new RegExp(name) });
  const color = (loc: ReturnType<Page["locator"]>) =>
    loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  const inList = await color(row.locator(".avatar"));
  await row.click();
  const inHeader = await color(page.locator(".conv-who .avatar"));

  expect(inHeader).toBe(inList);
});

test("a conversa não tem lupa no cabeçalho (não há busca dentro da conversa na v1)", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const phone = newPhone(4);
  await clientWrites(request, run, `Lupa ${run}`, phone);
  await signInAsAdmin(page);
  const { id } = await conversationIdOf(page, phone);
  await page.goto(`/conversas/${id}`);

  await expect(page.getByRole("article", { name: `Conversa com Lupa ${run}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buscar mensagens" })).toHaveCount(0);
});

test("?ficha=1 abre a ficha mesmo com a conversa já aberta", async ({
  page,
  request,
}, info) => {
  const run = `${info.project.name}${Date.now()}`;
  await clientWrites(request, run, `Ficha ${run}`, newPhone(5));
  await clientWrites(request, run, `Outra ${run}`, newPhone(6));
  await signInAsAdmin(page);
  const first = page.getByRole("link", { name: new RegExp(`Ficha ${run}`) });
  const other = await page
    .getByRole("link", { name: new RegExp(`Outra ${run}`) })
    .getAttribute("href");
  await first.click();
  await expect(page.getByRole("article", { name: `Conversa com Ficha ${run}` })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Ficha do contato" })).toHaveCount(0);

  // Navegação dentro do app (sem recarregar), como o link "Ficha" do card de um funil.
  await page.evaluate((href) => {
    history.pushState({}, "", `${href}?ficha=1`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, other);

  await expect(page.getByRole("complementary", { name: "Ficha do contato" })).toBeVisible();
});
