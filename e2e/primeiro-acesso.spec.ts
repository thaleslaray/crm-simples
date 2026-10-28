import { expect, test } from "./fixtures";
import { E2E_SETUP_CODE } from "./e2e-env";

// O D1 do E2E ja tem o admin do bootstrap e nao pode perder usuarios. Por isso a regra do servidor (so abre sem
// usuarios) fica nos testes de borda; aqui a API e simulada em GET so para ver o desvio e a tela, e o POST e o real.
const precisaDeSetup = (page: import("@playwright/test").Page) =>
  page.route("**/api/setup", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { needed: true } }) : route.continue(),
  );

test("sem a tela aberta pelo servidor, o primeiro acesso volta para o login", async ({ page }) => {
  await page.goto("/primeiro-acesso");
  await expect(page).toHaveURL(/\/login$/);
});

test("o login leva ao primeiro acesso quando o CRM ainda nao tem administrador", async ({ page }) => {
  await precisaDeSetup(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/primeiro-acesso$/);
  await expect(page.getByRole("heading", { name: "Primeiro acesso" })).toBeVisible();
  await expect(page.getByLabel("Código de instalação")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

// Fica por ultimo: o print da spec e o da ultima pagina, com o formulario e a mensagem de erro na tela.
test("o primeiro acesso recusa quando o CRM ja tem administrador, mesmo com o codigo certo", async ({ page }) => {
  await precisaDeSetup(page);
  await page.goto("/primeiro-acesso");
  await page.getByLabel("Código de instalação").fill(E2E_SETUP_CODE);
  await page.getByLabel("Nome").fill("Intrusa");
  await page.getByLabel("E-mail").fill("intrusa-e2e@exemplo.com");
  await page.getByLabel("Senha (mínimo 12 caracteres)").fill("senha-longa-123");
  await page.getByRole("button", { name: "Criar administrador e entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("já tem um administrador");
  await expect(page).toHaveURL(/\/primeiro-acesso$/);
});

