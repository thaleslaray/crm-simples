import type { APIRequestContext, Page } from "@playwright/test";
import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

async function clientWrites(request: APIRequestContext, id: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `et-${id}`,
        messageid: `WAET${id}`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${id}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Quero saber o preço",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

/** Com E2E_PRINTS, salva um print do passo (revisao visual); sem a variavel nao faz nada. */
async function snap(page: Page, name: string, project: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: `${dir}/etiquetas-${name}-${project}.png`, fullPage: true });
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("admin cria etiqueta, aplica no contato, filtra a caixa e a lista de contatos, e apagar a remove", async ({ page, request }, info) => {
  const run = `${info.project.name}${Date.now()}`;
  const labelName = `VIP${run}`;
  const phone = `55117${String(Date.now()).slice(-8)}`;
  await clientWrites(request, run, phone);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Cadastro (admin)
  await openUserMenu(page);
  await page.getByRole("link", { name: "Etiquetas" }).click();
  await page.getByLabel("Nome da etiqueta").fill(labelName);
  await page.getByRole("button", { name: "Adicionar" }).click();
  const list = page.getByRole("list", { name: "Etiquetas cadastradas" });
  await expect(list.getByText(labelName)).toBeVisible();
  await snap(page, "cadastro", info.project.name);
  await noHorizontalOverflow(page);
  await page.getByRole("link", { name: "Voltar" }).click();

  // Aplica pela ficha
  await page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first().click();
  const conversation = page.getByRole("article", { name: `Conversa com Cliente ${run}` });
  const toggle = conversation.getByRole("button", { name: "Ficha do contato" });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  await ficha.getByLabel("Adicionar etiqueta").selectOption({ label: labelName });
  await expect(ficha.getByRole("list").getByText(labelName)).toBeVisible();
  await snap(page, "ficha", info.project.name);
  await noHorizontalOverflow(page);

  // Aparece na caixa de entrada e filtra
  await page.goto("/");
  const item = page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).first();
  await expect(item.getByText(labelName)).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "Mais filtros" }).click();
  await page.getByRole("button", { name: labelName }).click();
  await expect(page.getByRole("link", { name: new RegExp(`Cliente ${run}`) })).toHaveCount(1);
  await expect(page.locator(".conv-item")).toHaveCount(1);
  await snap(page, "caixa", info.project.name);

  // Lista de contatos: busca por telefone e filtro por etiqueta
  await page.goto("/contatos");
  await page.getByLabel("Buscar contato").fill(phone.slice(-6));
  const contacts = page.getByRole("list", { name: "Contatos" });
  await expect(contacts.getByText(`Cliente ${run}`)).toBeVisible();
  await expect(contacts.getByText(labelName)).toBeVisible();
  await page.getByLabel("Buscar contato").fill("");
  await page.getByLabel("Filtrar por etiqueta").selectOption({ label: labelName });
  await expect(contacts.locator("li")).toHaveCount(1);
  await snap(page, "contatos", info.project.name);
  await noHorizontalOverflow(page);

  // Apagar a etiqueta a tira do contato
  await page.goto("/etiquetas");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Apagar ${labelName}` }).click();
  await expect(page.getByText(labelName)).toHaveCount(0);
  await page.goto("/contatos");
  await page.getByLabel("Buscar contato").fill(phone.slice(-6));
  await expect(page.getByRole("list", { name: "Contatos" }).getByText(`Cliente ${run}`)).toBeVisible();
  await expect(page.getByText(labelName)).toHaveCount(0);
});
