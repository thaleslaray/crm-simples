import { expect, openUserMenu, test } from "./fixtures";
import { E2E_ADMIN } from "./e2e-env";

test("entra com e-mail e senha, ve a caixa de entrada, sai e volta para o login", async ({ page }) => {
  // Rota protegida sem sessao -> login
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  // Senha errada e recusada
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill("senha-errada-000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toContainText("incorretos");

  // Credenciais certas -> caixa de entrada com o nome do usuario
  // (o D1 do E2E e compartilhado entre os testes, entao a caixa pode ja ter conversas)
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Atendimento" })).toBeVisible();
  await openUserMenu(page);
  await expect(page.getByTestId("user-name")).toHaveText(E2E_ADMIN.name);

  // Nada estoura a tela (sem rolagem horizontal), inclusive no celular
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  // Recarregar mantem a sessao
  await page.reload();
  await openUserMenu(page);
  await expect(page.getByTestId("user-name")).toHaveText(E2E_ADMIN.name);

  // Sair -> volta ao login e a rota protegida fecha de novo
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
