import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { signInAsNewAttendant } from "./atendente";
import { E2E_UAZAPI_PORT, E2E_WEBHOOK } from "./e2e-env";
import { expect, test } from "./fixtures";
import { openSettingsItem, signInAsAdmin } from "./navegacao";

const UAZAPI = `http://127.0.0.1:${E2E_UAZAPI_PORT}`;
const qr = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/AAAA`;

const program = (request: APIRequestContext, method: string, route: string, body: unknown) =>
  request.post(`${UAZAPI}/__fake/program`, { data: { method, path: route, responses: [{ body }] } });

/** Com E2E_PRINTS, salva um print nomeado do passo (revisão visual); sem a variável não faz nada. */
async function print(page: Page, name: string, projeto: string) {
  const dir = process.env.E2E_PRINTS;
  if (dir) await page.screenshot({ path: path.join(dir, `${name}-${projeto}.png`), fullPage: true });
}

test("admin informa os dados da Uazapi pela tela, vê só o fim do token e conecta o número; atendente não vê a tela", async ({
  page,
  request,
}, info) => {
  await signInAsAdmin(page);
  // Número desconectado: é quando a tela oferece "Conectar número".
  await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status: "disconnected" }, type: "Disconnected" },
  });

  // Instalação sem dados da Uazapi: a tela pede o endereço e o token e não oferece "Conectar número".
  await page.route("**/api/admin/uazapi", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { configured: false } }) : route.fallback(),
  );
  await openSettingsItem(page, /Conexão do número/);
  await expect(page.getByText("Informe os dados da Uazapi para conectar o número.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar número" })).toBeHidden();
  await print(page, "conexao-nao-configurada", info.project.name);

  // Salva: a Uazapi falsa confirma o token antes de o CRM gravar.
  await page.unroute("**/api/admin/uazapi");
  await program(request, "GET", "/instance/status", { instance: { status: "disconnected" } });
  await page.getByLabel("Endereço do servidor").fill(UAZAPI);
  await page.getByLabel("Token da instância").fill(E2E_WEBHOOK.instanceToken);
  await page.getByRole("button", { name: "Salvar" }).click();

  const resumo = page.getByTestId("uazapi-resumo");
  await expect(resumo).toContainText(`Servidor: ${UAZAPI}`);
  await expect(resumo).toContainText("Token ••••");
  await expect(resumo).not.toContainText(E2E_WEBHOOK.instanceToken);
  await expect(page.getByLabel("Token da instância")).toBeHidden();

  // O token inteiro nunca volta do servidor.
  const get = await page.request.get("/api/admin/uazapi");
  expect(await get.text()).not.toContain(E2E_WEBHOOK.instanceToken);

  // Com os dados salvos o pareamento funciona.
  await program(request, "POST", "/webhook", []);
  await program(request, "POST", "/instance/connect", { instance: { status: "connecting", qrcode: qr } });
  await program(request, "GET", "/instance/status", { instance: { status: "connecting", qrcode: qr } });
  await page.getByRole("button", { name: "Conectar número" }).click();
  await expect(page.getByRole("img", { name: "QR code para conectar o WhatsApp" })).toHaveAttribute("src", qr);
  await print(page, "conexao-configurada", info.project.name);

  // "Alterar" reabre o formulário com o endereço e sem o token.
  await resumo.getByRole("button", { name: "Alterar" }).click();
  await expect(page.getByLabel("Endereço do servidor")).toHaveValue(UAZAPI);
  await expect(page.getByLabel("Token da instância")).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(resumo).toBeVisible();

  // Devolve o estado: número conectado como no resto da suíte (os dados salvos são os mesmos do ambiente do E2E).
  await request.post(`/api/webhook/${E2E_WEBHOOK.urlSecret}`, {
    data: { EventType: "connection", token: E2E_WEBHOOK.instanceToken, instance: { status: "connected" } },
  });
  await request.post(`${UAZAPI}/__fake/reset`);

  // Atendente não vê a tela nem acessa a rota.
  await page.context().clearCookies();
  await signInAsNewAttendant(page);
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  if (desktop) await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Configurações" }).click();
  else await page.getByRole("navigation", { name: "Abas" }).getByRole("link", { name: "Mais" }).click();
  await expect(page.getByRole("navigation", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Conexão do número/ })).toBeHidden();
  expect((await page.request.get("/api/admin/uazapi")).status()).toBe(403);
});
