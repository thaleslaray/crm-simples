import { expect, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./e2e-env";

/**
 * Entra como admin, gera um convite de atendente pela API e aceita o convite na mesma sessão do navegador:
 * ao fim, `page` está logada como o atendente novo. Devolve nome e e-mail dele.
 */
export async function signInAsNewAttendant(page: Page, stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN.email);
  await page.getByLabel("Senha").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();

  const invite = await page.request.post("/api/admin/invites", { data: { role: "atendente" } });
  expect(invite.ok()).toBe(true);
  const { path } = (await invite.json()) as { path: string };
  const token = path.split("/").pop() ?? "";

  await page.context().clearCookies();
  const name = `Atendente ${stamp}`;
  const email = `atendente-${stamp}@exemplo.com`;
  const accepted = await page.request.post(`/api/invites/${token}`, { data: { name, email, password: "senha-do-atendente-1" } });
  expect(accepted.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Conversas" })).toBeVisible();
  return { name, email };
}
