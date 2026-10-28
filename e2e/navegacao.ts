import type { Page } from "@playwright/test";

/** Abre um item das Configurações pela barra de ícones (computador) ou pela aba "Mais" (celular), sem recarregar a página. */
export async function openSettingsItem(page: Page, item: string | RegExp) {
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  const rail = page.getByRole("navigation", { name: "Seções" });
  if (desktop) await rail.getByRole("link", { name: "Configurações" }).click();
  else
    await page
      .getByRole("navigation", { name: "Abas" })
      .getByRole("link", { name: "Mais" })
      .click();
  await page
    .getByRole("navigation", { name: "Configurações" })
    .getByRole("link", { name: item })
    .click();
}

/** Volta para a caixa de entrada pelo link Conversas da barra de ícones ou das abas. */
export async function backToInbox(page: Page) {
  await page.getByRole("link", { name: /^Conversas/ }).click();
}
