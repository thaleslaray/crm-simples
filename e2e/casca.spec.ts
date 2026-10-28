import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN, E2E_WEBHOOK } from "./e2e-env";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Atendimento" })).toBeVisible();
}

// Com E2E_PRINTS, guarda um print nomeado (claro/escuro) além do print automático de cada teste.
async function print(page: Page, project: string, name: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: path.join(dir, `casca-${name}-${project}.png`) });
}

const html = (page: Page) => page.locator("html");

test.describe("tema escuro do sistema", () => {
  test.use({ colorScheme: "dark" });

  test("segue o tema escuro do sistema no modo automático", async ({ page }, info) => {
    await signInAsAdmin(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await print(page, info.project.name, "inbox-escuro");
    await page.goto("/perfil");
    await print(page, info.project.name, "perfil-escuro");
  });

  test("a escolha do Perfil vence o sistema e continua depois de recarregar", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/perfil");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await page.getByRole("radio", { name: "Claro" }).check();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();

    await page.getByRole("radio", { name: "Automático" }).check();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });
});

test("no tema claro do sistema, escolher Escuro no Perfil fixa o escuro", async ({ page }, info) => {
  await signInAsAdmin(page);
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await print(page, info.project.name, "inbox-claro");
  await page.goto("/perfil");
  await page.getByRole("radio", { name: "Escuro" }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("o tema acompanha a troca do sistema enquanto está em automático", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("computador: barra de ícones à esquerda com as seções e o item ativo destacado", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "barra de ícones só no computador");
  await signInAsAdmin(page);
  const rail = page.getByRole("navigation", { name: "Seções" });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("link", { name: /^Conversas/ })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "Contatos" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Funis" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Abas" })).toBeHidden();

  await rail.getByRole("link", { name: "Contatos" }).click();
  await expect(page).toHaveURL(/\/contatos$/);
  await expect(rail.getByRole("link", { name: "Contatos" })).toHaveAttribute("aria-current", "page");
  await rail.getByRole("link", { name: "Funis" }).click();
  await expect(page).toHaveURL(/\/funis/);
  await rail.getByRole("link", { name: "Configurações" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
});

async function receiveFrom(request: APIRequestContext, run: string, phone: string) {
  const res = await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: {
      EventType: "messages",
      token: E2E_WEBHOOK.instanceToken,
      message: {
        id: `e2e-${run}-1`,
        messageid: `WA${run}1`,
        chatid: `${phone}@s.whatsapp.net`,
        sender: `${phone}@s.whatsapp.net`,
        senderName: `Cliente ${run}`,
        fromMe: false,
        isGroup: false,
        messageType: "conversation",
        text: "Olá, preciso de ajuda",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(res.status()).toBe(200);
}

test("celular: abas embaixo com o total de não lidas, e somem dentro da conversa", async ({ page, request }, info) => {
  test.skip(info.project.name !== "mobile", "abas só no celular");
  const run = `casca${Date.now()}`;
  await receiveFrom(request, run, `55119${String(Date.now()).slice(-8)}`);
  await signInAsAdmin(page);

  const tabs = page.getByRole("navigation", { name: "Abas" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seções" })).toBeHidden();
  // O total de não lidas aparece na aba Conversas (o banco do E2E é compartilhado: basta haver pelo menos uma).
  await expect(tabs.getByRole("link", { name: /^Conversas, \d+ não lida/ })).toBeVisible();

  await tabs.getByRole("link", { name: "Contatos" }).click();
  await expect(page).toHaveURL(/\/contatos$/);
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "Funis" }).click();
  await expect(page).toHaveURL(/\/funis/);
  await tabs.getByRole("link", { name: "Mais" }).click();
  await expect(page).toHaveURL(/\/perfil$/);

  await tabs.getByRole("link", { name: /^Conversas/ }).click();
  await page.getByRole("link", { name: new RegExp(`Cliente ${run}`) }).click();
  await expect(page.getByRole("article", { name: `Conversa com Cliente ${run}` })).toBeVisible();
  await expect(tabs).toBeHidden();
});

test("faixa de desconexão: admin vê Reconectar, atendente não", async ({ page, request }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const connection = (status: string, type?: string) =>
    request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
      data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status }, ...(type ? { type } : {}) },
    });
  try {
    await signInAsAdmin(page);
    await openUserMenu(page);
    await page.getByRole("link", { name: "Equipe" }).click();
    await page.getByRole("button", { name: "Gerar link de convite" }).click();
    const invite = await page.getByLabel("Link gerado").inputValue();

    expect((await connection("disconnected", "Disconnected")).status()).toBe(200);
    const banner = page.getByRole("alert").filter({ hasText: "desconectado" });
    await expect(banner).toBeVisible();
    await banner.getByRole("link", { name: "Reconectar" }).click();
    await expect(page).toHaveURL(/\/conexao$/);
    await expect(banner).toBeVisible();

    // Atendente convidado: vê a faixa em qualquer tela, sem o botão
    await page.context().clearCookies();
    await page.goto(invite);
    await page.getByLabel("Nome").fill(`Atendente ${stamp}`);
    await page.getByLabel("E-mail").fill(`atendente-${stamp}@exemplo.com`);
    await page.getByLabel("Senha").fill("senha-do-atendente-1");
    await page.getByRole("button", { name: "Criar acesso e entrar" }).click();
    await expect(page.getByRole("heading", { name: "Atendimento" })).toBeVisible();
    await expect(banner).toBeVisible();
    await expect(page.getByRole("link", { name: "Reconectar" })).toHaveCount(0);
    await page.goto("/perfil");
    await expect(banner).toBeVisible();
  } finally {
    await connection("connected");
  }
});
