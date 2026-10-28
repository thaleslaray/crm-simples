import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E_ADMIN } from "./e2e-env";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Nova conversa" })).toBeVisible();
}

test("atendente inicia conversa com um número novo; número inválido é recusado antes do envio", async ({ page }) => {
  const phone = `55119${String(Date.now()).slice(-8)}`;
  await login(page);

  await page.getByRole("button", { name: "Nova conversa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conversa" });
  await dialog.getByLabel("Contato ou número").fill("12ab");
  await dialog.getByLabel("Mensagem").fill("Olá!");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Número inválido");

  await dialog.getByLabel("Contato ou número").fill(phone);
  await expect(dialog).toContainText("Enviar para o número");
  await expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await dialog.getByRole("button", { name: "Enviar" }).click();

  await expect(page).toHaveURL(/\/conversas\//);
  await expect(page.getByRole("article", { name: /Conversa com/ }).getByText("Olá!")).toBeVisible();
});

test("a ficha tem a ação de iniciar conversa com o contato", async ({ page }) => {
  const phone = `55118${String(Date.now()).slice(-8)}`;
  await login(page);
  await page.getByRole("button", { name: "Nova conversa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conversa" });
  await dialog.getByLabel("Contato ou número").fill(phone);
  await dialog.getByLabel("Mensagem").fill("Primeira");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(page).toHaveURL(/\/conversas\//);

  const ficha = page.getByRole("complementary", { name: "Ficha do contato" });
  const toggle = page.getByRole("button", { name: "Ficha", exact: true });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await ficha.getByRole("button", { name: "Iniciar conversa" }).click();
  const again = page.getByRole("dialog", { name: "Nova conversa" });
  await expect(again.getByText("Para:")).toBeVisible();
  await again.getByLabel("Mensagem").fill("Segunda");
  await again.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("article", { name: /Conversa com/ }).getByText("Segunda")).toBeVisible();
});
