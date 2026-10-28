import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loggedInPage, openSettingsItem } from "./navegacao";

// O D1 do E2E é compartilhado entre todos os testes: o nome volta ao padrão no fim.
const DEFAULT_NAME = "Atendimento";

/** Salva pela tela e confere no servidor. */
async function saveName(page: Page, name: string) {
  await openSettingsItem(page, /Empresa/);
  await page.getByLabel("Nome da empresa").fill(name);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toHaveText("Nome salvo.");
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/workspace");
      return ((await res.json()) as { companyName: string }).companyName;
    })
    .toBe(name);
}

test.describe("o admin troca o nome da empresa", () => {
  test("o título e o cabeçalho da lista mudam numa segunda aba, sem recarregar", async ({
    browser,
  }, info) => {
    const name = `Loja ${info.project.name} ${Date.now()}`;
    const first = await loggedInPage(browser, info);
    const second = await loggedInPage(browser, info);
    try {
      await expect(second.page).toHaveTitle(new RegExp(`${DEFAULT_NAME}$`));

      await saveName(first.page, name);

      await expect(second.page.getByRole("heading", { name })).toBeVisible();
      await expect(second.page).toHaveTitle(new RegExp(`${name}$`));
    } finally {
      await saveName(first.page, DEFAULT_NAME);
      await first.context.close();
      await second.context.close();
    }
  });

  test("quem ainda não entrou vê o nome novo no login e na aba", async ({
    browser,
    page,
  }, info) => {
    const name = `Loja ${info.project.name} ${Date.now()}`;
    const admin = await loggedInPage(browser, info);
    try {
      await saveName(admin.page, name);

      await page.goto("/login");
      await expect(page.getByTestId("company-name-login")).toHaveText(name);
      await expect(page).toHaveTitle(name);
    } finally {
      await saveName(admin.page, DEFAULT_NAME);
      await admin.context.close();
    }
  });
});

test("nome vazio não salva", async ({ browser }, info) => {
  const { context, page } = await loggedInPage(browser, info);
  await openSettingsItem(page, /Empresa/);
  await page.getByLabel("Nome da empresa").fill("   ");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
  await context.close();
});
