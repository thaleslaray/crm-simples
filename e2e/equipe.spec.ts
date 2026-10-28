import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN } from "./e2e-env";

test("admin gera um convite, o convidado aceita e entra; o link nao serve de novo", async ({ page }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `convidado-${stamp}@exemplo.com`;
  const name = `Convidado ${stamp}`;

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await openUserMenu(page);
  await page.getByRole("link", { name: "Equipe" }).click();

  await page.getByRole("button", { name: "Gerar link de convite" }).click();
  const url = await page.getByLabel("Link gerado").inputValue();
  expect(url).toContain("/convite/");
  await expect(page.getByTestId("team-member").filter({ hasText: E2E_ADMIN.email })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // Quem abre o link nao tem sessao
  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByText("Você foi convidado como atendente.")).toBeVisible();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-do-convidado-1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole("button", { name: "Criar acesso e entrar" }).click();

  await expect(page.getByRole("heading", { name: "Atendimento" })).toBeVisible();
  await openUserMenu(page);
  await expect(page.getByTestId("user-name")).toHaveText(name);
  // Atendente nao ve o link da equipe
  await expect(page.getByRole("link", { name: "Equipe" })).toHaveCount(0);

  // Link usado: mensagem clara
  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByRole("alert")).toContainText("já foi usado");
});
